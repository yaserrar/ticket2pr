/**
 * Runs once when the Next.js server boots: runs left RUNNING by a previous
 * process become INTERRUPTED, and queued runs start (spec §7.5).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recoverRuns } = await import('./server/modules/runs/run-queue');
  await recoverRuns().catch((error) => console.error('[ticket2pr] Run recovery failed', error));
}
