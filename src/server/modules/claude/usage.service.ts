import 'server-only';
import { z } from 'zod';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import type { ClaudeUsageDto, ClaudeUsageStateDto } from '~/types/client-loop';

/**
 * The Claude subscription's usage, as reported by runs (rate-limit events),
 * and the queue pause when the limit is reached: queued runs wait for the
 * reset instead of failing one after another.
 */
export type UsageReport = {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization: number | null;
  /** Epoch seconds. */
  resetsAt: number | null;
  limitType: string | null;
};

/** Thrown by a runner when the usage limit stops a run. */
export class UsageLimitError extends Error {
  constructor(
    public readonly resetsAt: number | null,
    public readonly sessionId: string | null,
  ) {
    super('Your Claude usage limit is reached.');
    this.name = 'UsageLimitError';
  }
}

/** Without a reset time from Claude, try again in 30 minutes. */
const FALLBACK_PAUSE_MS = 30 * 60_000;

const storedSchema = z.object({
  status: z.enum(['allowed', 'allowed_warning', 'rejected']),
  utilization: z.number().nullable(),
  resetsAt: z.string().nullable(),
  limitType: z.string().nullable(),
  reportedAt: z.string(),
});

function parseUsage(json: string | null): ClaudeUsageDto | null {
  if (!json) return null;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function row() {
  return prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export const usageService = {
  async state(): Promise<ClaudeUsageStateDto> {
    const settings = await row();
    const paused = settings.claudePausedUntil && settings.claudePausedUntil > new Date() ? settings.claudePausedUntil : null;
    return { pausedUntil: paused?.toISOString() ?? null, usage: parseUsage(settings.claudeUsageJson) };
  },

  /** The pause end, or null when runs may start. An expired pause is cleared. */
  async pausedUntil(): Promise<Date | null> {
    const settings = await row();
    if (!settings.claudePausedUntil) return null;
    if (settings.claudePausedUntil > new Date()) return settings.claudePausedUntil;
    await prisma.settings.update({ where: { id: 1 }, data: { claudePausedUntil: null } });
    return null;
  },

  async record(report: UsageReport) {
    const usage: ClaudeUsageDto = {
      status: report.status,
      utilization: report.utilization,
      resetsAt: report.resetsAt ? new Date(report.resetsAt * 1000).toISOString() : null,
      limitType: report.limitType,
      reportedAt: new Date().toISOString(),
    };
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, claudeUsageJson: JSON.stringify(usage) },
      update: { claudeUsageJson: JSON.stringify(usage) },
    });
  },

  /** Limit reached: pause the queue until the reset. Returns the pause end. */
  async pause(resetsAt: number | null): Promise<Date> {
    const until = resetsAt && resetsAt * 1000 > Date.now() ? new Date(resetsAt * 1000) : new Date(Date.now() + FALLBACK_PAUSE_MS);
    await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, claudePausedUntil: until }, update: { claudePausedUntil: until } });
    logger.warn({ until }, 'Claude usage limit reached: queue paused');
    return until;
  },

  /** "Resume now" (e.g. after upgrading the plan). */
  async resume() {
    await prisma.settings.update({ where: { id: 1 }, data: { claudePausedUntil: null } });
  },
};
