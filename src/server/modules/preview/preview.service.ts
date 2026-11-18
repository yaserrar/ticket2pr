import 'server-only';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { z } from 'zod';
import { logger } from '~/server/config/logger';
import { worktreesRoot } from '~/server/modules/git/worktree';

/**
 * Screenshots of UI changes for the client (public pages only). After a run,
 * Ticket2PR starts the app in the card's folder with the project's preview
 * command, opens the pages Claude named in headless Chrome, saves a
 * screenshot of each, then stops the app. Ticket2PR does this, not Claude:
 * the agent's tool policy is unchanged.
 */
export const DEFAULT_PREVIEW_URL = 'http://localhost:$PORT';
const READY_TIMEOUT_MS = 120_000;
const PAGE_TIMEOUT_MS = 30_000;
const VIEWPORT = { width: 1280, height: 800 };

export const screenshotSchema = z.object({ file: z.string(), page: z.string(), takenAt: z.string() });
export type Screenshot = z.infer<typeof screenshotSchema>;
export const screenshotsSchema = z.array(screenshotSchema);

export function screenshotsDir(cardId: string) {
  return path.join(path.dirname(worktreesRoot()), 'screenshots', cardId);
}

export async function removeScreenshots(cardId: string) {
  await rm(screenshotsDir(cardId), { recursive: true, force: true }).catch(() => undefined);
}

/** A screenshot file of this card (names are ours: no paths from the client). */
export function screenshotPath(cardId: string, file: string) {
  if (!/^[\w-]+\.png$/.test(file)) return null;
  return path.join(screenshotsDir(cardId), file);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Stops the app and everything it started (its own process group). */
function stop(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  const kill = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      child.kill(signal);
    }
  };
  kill('SIGTERM');
  setTimeout(() => child.exitCode === null && kill('SIGKILL'), 3_000).unref();
}

async function waitUntilUp(url: string, child: ChildProcess, output: () => string, signal?: AbortSignal) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Stopped.');
    if (child.exitCode !== null) throw new Error(`The preview command stopped (exit ${child.exitCode}).\n${output()}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual', cache: 'no-store' });
      if (res.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`The app didn’t answer on ${url} within 2 minutes.\n${output()}`);
}

/** Headless Chrome: the developer's installed Chrome first, Playwright's Chromium if installed. */
async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (chromeError) {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      logger.warn({ err: chromeError }, 'Launching Chrome for screenshots failed');
      throw new Error('Screenshots need Google Chrome. Install it, or run `npx playwright install chromium`.');
    }
  }
}

const LOGIN_PAGE = /(^|\/)(login|log-in|signin|sign-in|auth|connexion)(\/|$|\?)/i;

export type TakeScreenshotsInput = {
  cardId: string;
  /** A prefix for the file names (the run id), so a new run doesn't overwrite what's on Trello. */
  prefix: string;
  folder: string;
  repoPath: string;
  command: string;
  urlTemplate: string | null;
  pages: string[];
  log: (message: string) => Promise<void>;
  signal?: AbortSignal;
};

/** Returns the screenshots taken; pages that fail or need a login are skipped and logged. */
export async function takeScreenshots(input: TakeScreenshotsInput): Promise<Screenshot[]> {
  const port = await freePort();
  const base = (input.urlTemplate?.trim() || DEFAULT_PREVIEW_URL).replace(/\$PORT|\{port\}/g, String(port)).replace(/\/$/, '');
  const command = input.command.replace(/\$PORT|\{port\}/g, String(port));
  const tail: string[] = [];
  const output = () => tail.slice(-12).join('').trim().slice(-2000);

  await input.log(`Starting the app for screenshots: ${command}`);
  // $REPO_PATH lets the command copy what a worktree lacks, e.g. `cp "$REPO_PATH/.env" .`
  // NODE_ENV is Ticket2PR's own ("production" after a build): the app picks its own.
  const childEnv: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_ENV'));
  Object.assign(childEnv, { PORT: String(port), REPO_PATH: input.repoPath, BROWSER: 'none' });
  const child = spawn(command, { cwd: input.folder, shell: true, detached: true, env: childEnv as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const collect = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 40) tail.shift();
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    await waitUntilUp(base, child, output, input.signal);
    await input.log(`The app answers on ${base}.`);
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const dir = screenshotsDir(input.cardId);
    await mkdir(dir, { recursive: true });
    const shots: Screenshot[] = [];

    for (const [i, page] of input.pages.entries()) {
      if (input.signal?.aborted) break;
      const tab = await context.newPage();
      try {
        const res = await tab
          .goto(`${base}${page}`, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS })
          .catch(() => tab.goto(`${base}${page}`, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS }));
        const landed = new URL(tab.url()).pathname;
        if (res && res.status() >= 400) {
          await input.log(`Skipped ${page}: the app answered ${res.status()}.`);
          continue;
        }
        if (LOGIN_PAGE.test(landed) && !LOGIN_PAGE.test(page)) {
          await input.log(`Skipped ${page}: it needs a login (screenshots are of public pages only).`);
          continue;
        }
        await tab.waitForTimeout(600);
        const file = `${input.prefix}-${i + 1}.png`;
        await tab.screenshot({ path: path.join(dir, file) });
        shots.push({ file, page, takenAt: new Date().toISOString() });
        await input.log(`Screenshot of ${page} saved.`);
      } catch (error) {
        await input.log(`Skipped ${page}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      } finally {
        await tab.close().catch(() => undefined);
      }
    }
    return shots;
  } finally {
    await browser?.close().catch(() => undefined);
    stop(child);
  }
}

/** Removes this card's screenshots except the ones listed. */
export async function pruneScreenshots(cardId: string, keep: string[]) {
  const dir = screenshotsDir(cardId);
  const files = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(files.filter((f) => !keep.includes(f)).map((f) => rm(path.join(dir, f), { force: true })));
}
