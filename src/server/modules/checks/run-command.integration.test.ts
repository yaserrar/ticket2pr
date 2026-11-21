import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { runCommand } from './run-command';

/**
 * Check commands against real processes: a check ends with its command, its
 * timeout or Stop, and takes everything it started with it.
 */
const run = (command: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
  runCommand({
    command,
    cwd: os.tmpdir(),
    repoPath: os.tmpdir(),
    timeoutMs: opts.timeoutMs ?? 10_000,
    signal: opts.signal ?? new AbortController().signal,
    onOutput: () => undefined,
  });

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const leftoverPid = (output: string) => Number(/pid=(\d+)/.exec(output)?.[1]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runCommand', () => {
  it('passes or fails on the exit code, with the output', async () => {
    await expect(run('echo ok')).resolves.toMatchObject({ status: 'PASSED', exitCode: 0, output: 'ok\n' });
    await expect(run('echo broken >&2; exit 2')).resolves.toMatchObject({ status: 'FAILED', exitCode: 2, output: 'broken\n' });
  });

  it('ends when the command ends, even if something it started still holds the output', async () => {
    const started = Date.now();
    const result = await run('sleep 30 & echo "pid=$!"; exit 1');
    expect(result.status).toBe('FAILED');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('left running');
    expect(Date.now() - started).toBeLessThan(5_000);
    await wait(200);
    expect(alive(leftoverPid(result.output))).toBe(false);
  });

  it('times out, and stops what the command started', async () => {
    const started = Date.now();
    const result = await run('sleep 30 & echo "pid=$!"; wait', { timeoutMs: 300 });
    expect(result.status).toBe('TIMED_OUT');
    expect(Date.now() - started).toBeLessThan(5_000);
    await wait(200);
    expect(alive(leftoverPid(result.output))).toBe(false);
  });

  it('stops on Stop, killing a process that ignores SIGTERM after its parent has exited', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = run(`(trap '' TERM; sleep 30) & echo "pid=$!"; trap 'exit 3' TERM; wait`, { signal: controller.signal });
    await wait(300);
    controller.abort();
    const result = await pending;
    expect(result.status).toBe('SKIPPED');
    expect(Date.now() - started).toBeLessThan(5_000);
    await wait(3_500);
    expect(alive(leftoverPid(result.output))).toBe(false);
  });
});
