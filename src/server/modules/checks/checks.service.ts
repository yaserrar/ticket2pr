import 'server-only';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { notFound } from '~/server/http/errors';
import { runCommand } from './run-command';
import { detectPackageManager } from '~/server/modules/runs/runners/tool-policy';
import { fakeCheckFailure } from '~/server/modules/runs/runners/fake-runner';
import { runnerName } from '~/server/modules/runs/runners';
import {
  checkConfigsSchema,
  checksStatusSchema,
  checkStatusSchema,
  isCheckFailure,
  outputTail,
  overallStatus,
  suggestChecks,
  type CheckConfig,
  type CheckStatus,
  type ChecksStatus,
} from '~/lib/checks';
import type { FailedCheck } from '~/server/modules/runs/prompt';
import type { RunChecksDto } from '~/types/checks';
import type { RunEventPayload, RunKind, RunStatus } from '~/types/run';

/**
 * Checks before review: after Claude's run, Ticket2PR (not Claude) runs the
 * commands configured in Project settings, one after the other, in the
 * card's folder (its worktree, or the shared branch's folder). Commands come
 * from the settings only, never from card text. Results are stored per run
 * and mirrored on the card for the board.
 */
const STORED_OUTPUT = { maxLines: 300, maxChars: 16_000 };
const PROMPT_OUTPUT = { maxLines: 80, maxChars: 4_000 };
const LIVE_FLUSH_MS = 1_500;

export function parseCheckConfigs(json: string | null): CheckConfig[] {
  if (!json) return [];
  try {
    const parsed = checkConfigsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** The project's checks, when they are on. */
export function enabledChecks(project: { checksEnabled: boolean; checksJson: string | null }) {
  return project.checksEnabled ? parseCheckConfigs(project.checksJson) : [];
}

const read = (repoPath: string, file: string) => readFile(path.join(repoPath, file), 'utf8').catch(() => null);

type CardChecksRow = { name: string; status: CheckStatus };

export type ChecksOutcome = {
  status: Exclude<ChecksStatus, 'RUNNING'>;
  /** The failing checks, with the end of their output, for a fix round. */
  failed: FailedCheck[];
  durationMs: number;
};

export const checksService = {
  /** Typecheck, lint and tests from the repository's package.json, Makefile or pyproject.toml. */
  async suggest(repoPath: string): Promise<CheckConfig[]> {
    const files = await readdir(repoPath).catch(() => [] as string[]);
    const [packageJson, makefile, pyproject] = await Promise.all([
      files.includes('package.json') ? read(repoPath, 'package.json') : null,
      files.includes('Makefile') ? read(repoPath, 'Makefile') : null,
      files.includes('pyproject.toml') ? read(repoPath, 'pyproject.toml') : null,
    ]);
    return suggestChecks({ files, packageManager: detectPackageManager(files), packageJson, makefile, pyproject });
  },

  /**
   * Runs every check in order and records each result. All of them run, so a
   * fix round gets every failure at once. On Stop, the running command is
   * ended, the rest are skipped, and the run's stop error is thrown.
   */
  async run(input: {
    runId: string;
    cardId: string;
    folder: string;
    repoPath: string;
    checks: CheckConfig[];
    signal: AbortSignal;
    emit: (event: RunEventPayload) => Promise<void>;
  }): Promise<ChecksOutcome> {
    const { runId, cardId, checks, signal } = input;
    const started = Date.now();
    const rows = await prisma.$transaction(
      checks.map((check, position) => prisma.runCheck.create({ data: { runId, position, name: check.name, command: check.command } })),
    );
    const summary: CardChecksRow[] = checks.map((c) => ({ name: c.name, status: 'PENDING' }));
    const mirror = (status: ChecksStatus) =>
      prisma.card.update({ where: { id: cardId }, data: { checksStatus: status, checksJson: JSON.stringify(summary) } });
    await prisma.run.update({ where: { id: runId }, data: { checksStatus: 'RUNNING' } });
    await mirror('RUNNING');
    await input.emit({ type: 'info', message: `Running ${checks.length === 1 ? 'the check' : `${checks.length} checks`}: ${checks.map((c) => c.name).join(', ')}` });

    const failed: FailedCheck[] = [];
    for (const [i, check] of checks.entries()) {
      const row = rows[i]!;
      if (signal.aborted) {
        summary[i]!.status = 'SKIPPED';
        await prisma.runCheck.update({ where: { id: row.id }, data: { status: 'SKIPPED' } });
        continue;
      }
      summary[i]!.status = 'RUNNING';
      const checkStarted = new Date();
      await prisma.runCheck.update({ where: { id: row.id }, data: { status: 'RUNNING', startedAt: checkStarted } });
      await mirror('RUNNING');
      await input.emit({ type: 'info', message: `$ ${check.command}` });

      // The running check's output, saved every so often so the Checks tab follows it.
      let latest = '';
      let flushing: Promise<unknown> = Promise.resolve();
      let lastFlush = 0;
      const result = await runCommand({
        command: check.command,
        cwd: input.folder,
        repoPath: input.repoPath,
        timeoutMs: check.timeoutMin * 60_000,
        signal,
        onOutput: (output) => {
          latest = output;
          if (Date.now() - lastFlush < LIVE_FLUSH_MS) return;
          lastFlush = Date.now();
          flushing = flushing
            .then(() => prisma.runCheck.update({ where: { id: row.id }, data: { output: outputTail(latest, STORED_OUTPUT) } }))
            .catch(() => undefined);
        },
      });
      await flushing;

      // Fake mode: `[fake:checks-fail…]` on the card makes the first check fail (see the fake runner).
      if (i === 0 && result.status === 'PASSED' && runnerName() === 'fake' && (await fakeCheckFailure(input.folder))) {
        Object.assign(result, { status: 'FAILED', exitCode: 1, output: `${result.output}\nSimulated failure: the card asks for it with [fake:checks-fail…].` });
      }

      const durationMs = Date.now() - checkStarted.getTime();
      summary[i]!.status = result.status;
      await prisma.runCheck.update({
        where: { id: row.id },
        data: { status: result.status, exitCode: result.exitCode, durationMs, output: outputTail(result.output, STORED_OUTPUT), endedAt: new Date() },
      });
      await input.emit({ type: 'check', name: check.name, command: check.command, status: result.status, durationMs });
      if (isCheckFailure(result.status)) {
        failed.push({
          name: check.name,
          command: check.command,
          status: result.status as FailedCheck['status'],
          exitCode: result.exitCode,
          output: outputTail(result.output, PROMPT_OUTPUT),
          timeoutMin: check.timeoutMin,
        });
      }
    }

    const status = overallStatus(summary.map((s) => s.status), signal.aborted);
    const durationMs = Date.now() - started;
    await prisma.run.update({ where: { id: runId }, data: { checksStatus: status, checksMs: durationMs } });
    await mirror(status);
    if (signal.aborted) throw new Error('Run stopped');
    return { status, failed, durationMs };
  },

  /** The checks of the card's runs, newest first. */
  async forCard(cardId: string): Promise<RunChecksDto[]> {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw notFound('Card');
    const runs = await prisma.run.findMany({
      where: { cardId, checksStatus: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { checks: { orderBy: { position: 'asc' } } },
    });
    return runs.map((run) => ({
      runId: run.id,
      runKind: run.kind as RunKind,
      fixRound: run.fixRound,
      runStatus: run.status as RunStatus,
      status: checksStatusSchema.catch('STOPPED').parse(run.checksStatus),
      checksMs: run.checksMs,
      createdAt: run.createdAt.toISOString(),
      checks: run.checks.map((c) => ({
        id: c.id,
        name: c.name,
        command: c.command,
        status: checkStatusSchema.catch('SKIPPED').parse(c.status),
        exitCode: c.exitCode,
        durationMs: c.durationMs,
        output: c.output,
        startedAt: c.startedAt?.toISOString() ?? null,
      })),
    }));
  },

  /** On server start: checks left running by a previous process are recorded as stopped. */
  async recover() {
    const runs = await prisma.run.findMany({ where: { checksStatus: 'RUNNING', status: { not: 'RUNNING' } }, select: { id: true, cardId: true } });
    if (!runs.length) return;
    await prisma.$transaction([
      prisma.runCheck.updateMany({ where: { runId: { in: runs.map((r) => r.id) }, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'SKIPPED' } }),
      prisma.run.updateMany({ where: { id: { in: runs.map((r) => r.id) } }, data: { checksStatus: 'STOPPED' } }),
      prisma.card.updateMany({ where: { id: { in: runs.map((r) => r.cardId) }, checksStatus: 'RUNNING' }, data: { checksStatus: 'STOPPED' } }),
    ]);
    logger.warn({ count: runs.length }, 'Marked interrupted checks as stopped');
  },
};
