import 'server-only';
import { spawn } from 'node:child_process';
import { stopProcessTree } from '~/server/modules/preview/preview.service';
import type { CheckStatus } from '~/lib/checks';

/** Kept in memory while a command runs: enough for the stored tail. */
const BUFFER_CHARS = 64_000;
/** How long the output may stay open after the command has ended. */
const EXIT_GRACE_MS = 2_000;

export type CommandResult = { status: CheckStatus; exitCode: number | null; output: string };

/**
 * Runs one check command in its own process group. A timeout or Stop ends it
 * and everything it started, and so does its own end: nothing it leaves
 * running (a server, a watcher) outlives the check or holds it open.
 * Colours are turned off; `CI=1` keeps test runners out of watch mode.
 * Ticket2PR's own NODE_ENV is not passed on.
 */
export function runCommand(input: {
  command: string;
  cwd: string;
  repoPath: string;
  timeoutMs: number;
  signal: AbortSignal;
  onOutput: (output: string) => void;
}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_ENV'));
    Object.assign(env, { CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', REPO_PATH: input.repoPath });
    let output = '';
    let timedOut = false;
    let settled = false;
    let exitGrace: NodeJS.Timeout | undefined;
    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      detached: true,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > BUFFER_CHARS) output = output.slice(-BUFFER_CHARS);
      input.onOutput(output);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      timedOut = true;
      stopProcessTree(child);
    }, input.timeoutMs);
    const onAbort = () => stopProcessTree(child);
    input.signal.addEventListener('abort', onAbort, { once: true });

    const done = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(exitGrace);
      input.signal.removeEventListener('abort', onAbort);
      stopProcessTree(child);
      resolve(result);
    };
    const finish = (code: number | null, note = '') => {
      if (input.signal.aborted) done({ status: 'SKIPPED', exitCode: code, output: `${output}\nStopped by you.` });
      else if (timedOut) done({ status: 'TIMED_OUT', exitCode: code, output: `${output}\nStopped: the check took longer than its timeout.` });
      else done({ status: code === 0 ? 'PASSED' : 'FAILED', exitCode: code, output: `${output}${note}` });
    };
    child.on('error', (error) => done({ status: 'FAILED', exitCode: null, output: `${output}\n${error.message}` }));
    child.on('close', (code) => finish(code));
    // A process the command left running keeps the output open after the
    // command has ended: give the output a moment, then end the check.
    child.on('exit', (code) => {
      if (settled) return;
      exitGrace = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(code, '\nStopped the processes the check left running.');
      }, EXIT_GRACE_MS);
    });
  });
}
