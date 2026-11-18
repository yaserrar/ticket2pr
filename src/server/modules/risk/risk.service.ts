import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError } from '~/server/http/errors';
import { assessRisk, parseRiskPaths, riskDetailsSchema, riskLevelSchema, type RiskAssessment, type RiskFile } from '~/lib/risk';
import { getChanges } from '~/server/modules/git/changes';
import { isWorktree } from '~/server/modules/git/worktree';

/**
 * The risk flag of a card's changes (rules in `~/lib/risk`). Stored on the
 * card for the board badge; refreshed after each run, whenever the Changes
 * tab reads the diff, and right before push / pull request. A new verdict
 * clears "I reviewed the high-risk files": the reviewer saw other changes.
 */
type RiskCard = {
  id: string;
  worktreePath: string | null;
  startSha: string | null;
  riskLevel: string | null;
  riskJson: string | null;
  project: { baseBranch: string; riskPaths: string | null };
};

export const riskService = {
  /** Assess from a diff already read, and store it when it changed. */
  async store(card: RiskCard, files: RiskFile[]): Promise<RiskAssessment> {
    const risk = assessRisk(files, parseRiskPaths(card.project.riskPaths));
    const json = JSON.stringify({ areas: risk.areas, stats: risk.stats });
    if (card.riskLevel !== risk.level || card.riskJson !== json) {
      await prisma.card.update({ where: { id: card.id }, data: { riskLevel: risk.level, riskJson: json, riskReviewedAt: null } });
    }
    return risk;
  },

  /** Reads the diff and stores the risk. Null when the card has no folder. */
  async refresh(card: RiskCard): Promise<RiskAssessment | null> {
    if (!card.worktreePath || !(await isWorktree(card.worktreePath))) return null;
    const changes = await getChanges(card.worktreePath, card.project.baseBranch, card.startSha);
    return this.store(card, changes.files);
  },

  /**
   * Before push / pull request: high-risk changes need "I reviewed the
   * high-risk files" (once per verdict). Returns the current risk.
   */
  async assertReviewed(card: RiskCard & { riskReviewedAt: Date | null }, reviewed: boolean) {
    const before = card.riskJson;
    const risk = await this.refresh(card);
    if (!risk || risk.level !== 'HIGH') return risk;
    const fresh = before === JSON.stringify({ areas: risk.areas, stats: risk.stats }) && card.riskLevel === 'HIGH';
    if (fresh && card.riskReviewedAt) return risk;
    if (!reviewed) {
      const areas = risk.areas.filter((a) => a.level === 'HIGH').map((a) => a.label.toLowerCase());
      throw new HttpError(
        409,
        `These changes touch ${areas.join(', ')}. Review those files carefully, then confirm before pushing.`,
        'RISK_REVIEW_REQUIRED',
      );
    }
    await prisma.card.update({ where: { id: card.id }, data: { riskReviewedAt: new Date() } });
    return risk;
  },

  parse(level: string | null, json: string | null): RiskAssessment | null {
    const parsedLevel = riskLevelSchema.safeParse(level);
    if (!parsedLevel.success || !json) return null;
    try {
      const details = riskDetailsSchema.safeParse(JSON.parse(json));
      return details.success ? { level: parsedLevel.data, ...details.data } : null;
    } catch {
      return null;
    }
  },
};
