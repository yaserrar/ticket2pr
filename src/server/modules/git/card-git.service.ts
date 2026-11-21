import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError, notFound } from '~/server/http/errors';
import { settingsService } from '~/server/modules/settings/settings.service';
import { openPullRequest } from '~/server/modules/github/github.client';
import { workflowService } from '~/server/modules/workflow/workflow.service';
import type { ChangesDto, GitStatusDto } from '~/types/git';
import type { CommitInput, OpenPrInput, PushInput } from '~/schemas/card';
import { riskMarkdown } from '~/lib/risk';
import { checkSummarySchema, checksMarkdown, checksStatusSchema, failingNames } from '~/lib/checks';
import { parseJson } from '~/server/presenters/card.presenter';
import { riskService } from '~/server/modules/risk/risk.service';
import { addLabels } from '~/server/modules/github/github.client';
import { commitAll, getBranchStatus, getChanges, pushBranch, resetChanges } from './changes';
import { gitTry, originGithub } from './git.client';
import { compareUrl } from './remote';
import { splitSummary } from '~/lib/summary';
import { isWorktree, removeWorktree } from './worktree';
import { fetchBranchThrottled, mergeBaseInto, uncommittedCount } from './shared-checkout';

/**
 * Git actions on a card's worktree (spec §8.3–8.5): changes, status, commit,
 * push, pull request, reset. Humans do these; the agent never commits or pushes.
 */
async function loadWorkingCard(cardId: string, { idle = false } = {}) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      project: true,
      runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, summary: true } },
    },
  });
  if (!card) throw notFound('Card');
  if (!card.worktreePath || !card.branchName || !(await isWorktree(card.worktreePath))) {
    throw new HttpError(409, 'This card has no worktree yet. Move it to In progress to create one.', 'GIT_ERROR');
  }
  if (idle && card.runs[0]?.status === 'RUNNING') {
    throw new HttpError(409, 'Wait for the run to finish, or stop it first.', 'GIT_ERROR');
  }
  return card as typeof card & { worktreePath: string; branchName: string };
}

/** A working card is on the shared branch once its start commit is recorded. */
const isShared = (card: { startSha: string | null }) => Boolean(card.startSha);

function checksOf(card: { checksStatus: string | null; checksJson: string | null }) {
  const status = checksStatusSchema.safeParse(card.checksStatus);
  return status.success ? { status: status.data, checks: parseJson(card.checksJson ?? '[]', checkSummarySchema, []) } : null;
}

/** Failing checks: push and pull request ask "push anyway" each time, like the high-risk confirmation. */
function assertChecksConfirmed(card: { checksStatus: string | null; checksJson: string | null }, confirmed: boolean) {
  const checks = checksOf(card);
  if (checks?.status !== 'FAILED' || confirmed) return;
  throw new HttpError(
    409,
    `The project's checks are failing (${failingNames(checks.checks) || 'see the Checks tab'}). Look at them first, then confirm to push anyway.`,
    'CHECKS_FAILING',
  );
}

const sharedOnly = () =>
  new HttpError(409, 'This card works on the project’s shared branch: there is no card branch to update or clean up.', 'GIT_ERROR');

/** Removes a Done card's worktree; deletes its local branch only when origin has every commit of it. */
async function cleanupCard(card: {
  id: string;
  title: string;
  status: string;
  startSha: string | null;
  worktreePath: string | null;
  branchName: string | null;
  project: { repoPath: string | null; baseBranch: string };
}) {
  if (card.status !== 'DONE') throw new HttpError(409, 'Only Done cards are cleaned up.', 'GIT_ERROR');
  if (isShared(card)) throw sharedOnly();
  const repoPath = card.project.repoPath;
  if (!repoPath) throw new HttpError(409, 'This project has no repository.', 'REPO_NOT_CONFIGURED');

  if (card.worktreePath && (await isWorktree(card.worktreePath)) && (await uncommittedCount(card.worktreePath))) {
    throw new HttpError(409, `“${card.title}” has uncommitted changes in its worktree. Commit or reset them first.`, 'GIT_ERROR');
  }
  await removeWorktree({ repoPath, worktreePath: card.worktreePath, branchName: null, deleteBranch: false });

  let deletedBranch = false;
  let keptBranchReason: string | null = null;
  const branch = card.branchName;
  if (branch && (await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]))) {
    const onOrigin = await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
    const unpushed = onOrigin ? Number((await gitTry(repoPath, ['rev-list', '--count', `origin/${branch}..${branch}`])) ?? 1) : null;
    // Deleted on origin after merging: safe when the base already contains every commit.
    const mergedIntoBase =
      !onOrigin && (await gitTry(repoPath, ['merge-base', '--is-ancestor', branch, `refs/remotes/origin/${card.project.baseBranch}`])) !== null;
    if (unpushed === 0 || mergedIntoBase) {
      deletedBranch = (await gitTry(repoPath, ['branch', '-D', branch])) !== null;
    } else {
      keptBranchReason = onOrigin ? `${branch} has commits that were never pushed` : `${branch} is not on origin`;
    }
  }
  await prisma.card.update({ where: { id: card.id }, data: { worktreePath: null } });
  return { removedWorktree: Boolean(card.worktreePath), deletedBranch, keptBranchReason };
}

/** The reviewer summary from the latest finished run (the agent's final message); fix rounds only fix the checks. */
async function latestSummary(cardId: string) {
  const run = await prisma.run.findFirst({
    where: { cardId, status: 'SUCCEEDED', summary: { not: null }, kind: { in: ['INITIAL', 'FOLLOW_UP'] } },
    orderBy: { createdAt: 'desc' },
    select: { summary: true },
  });
  // The client update and questions are for Trello, not the commit or the PR.
  return splitSummary(run?.summary).summary;
}

export const cardGitService = {
  async changes(cardId: string): Promise<ChangesDto> {
    const card = await loadWorkingCard(cardId);
    const changes = await getChanges(card.worktreePath, card.project.baseBranch, card.startSha);
    // The badge follows the diff (manual edits, follow-up runs).
    await riskService.store(card, changes.files);
    return changes;
  },

  async status(cardId: string): Promise<GitStatusDto> {
    const card = await loadWorkingCard(cardId);
    // Keeps "N behind {base}" current without fetching on every read.
    if (!isShared(card) && card.project.repoPath) await fetchBranchThrottled(card.project.repoPath, card.project.baseBranch);
    const [branch, origin, summary, settings, reviewer] = await Promise.all([
      getBranchStatus(card.worktreePath, card.project.baseBranch, card.branchName, card.startSha),
      originGithub(card.worktreePath),
      latestSummary(cardId),
      settingsService.row(),
      gitTry(card.worktreePath, ['config', 'user.name']),
    ]);
    // spec §8.4: `feat({shortLink}): {title}` + summary + Trello link.
    const suggestedCommitMessage = [`feat(${card.trelloShortLink}): ${card.title}`, summary, `Trello: ${card.trelloUrl}`]
      .filter(Boolean)
      .join('\n\n');
    // spec §8.5: summary, Trello link, "Generated with Claude Code, reviewed by {user}".
    const risk = riskService.parse(card.riskLevel, card.riskJson);
    const checks = checksOf(card);
    const body = [
      summary || '_No summary._',
      risk ? riskMarkdown(risk) : null,
      checks && checks.status !== 'RUNNING' ? checksMarkdown(checks.status, checks.checks) : null,
      `**Trello:** ${card.trelloUrl}`,
      `---\nGenerated with Claude Code via Ticket2PR${reviewer ? `, reviewed by ${reviewer}` : ''}.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const shared = isShared(card);
    const releaseCompareUrl =
      shared && origin.github && card.branchName !== card.project.baseBranch
        ? compareUrl(origin.github, card.project.baseBranch, card.branchName)
        : null;

    return {
      workMode: shared ? 'SHARED_BRANCH' : 'BRANCH_PER_CARD',
      inRepoFolder: Boolean(card.project.repoPath && card.worktreePath === card.project.repoPath),
      releaseCompareUrl,
      branchName: card.branchName,
      worktreePath: card.worktreePath,
      baseBranch: card.project.baseBranch,
      ...branch,
      github: origin.github,
      githubTokenSet: Boolean(settings.githubToken),
      prUrl: card.prUrl,
      suggestedCommitMessage,
      suggestedPr: { title: card.title, body },
    };
  },

  async commit(cardId: string, input: CommitInput) {
    const card = await loadWorkingCard(cardId, { idle: true });
    const sha = await commitAll(card.worktreePath, input.message);
    return { sha };
  },

  /** Branch-per-card: pushes the card branch. Shared branch: pushes the branch and the card is Done. */
  async push(cardId: string, input: Required<PushInput> = { riskReviewed: false, checksFailingConfirmed: false }) {
    const card = await loadWorkingCard(cardId, { idle: true });
    assertChecksConfirmed(card, input.checksFailingConfirmed);
    await riskService.assertReviewed(card, input.riskReviewed);
    const status = await getBranchStatus(card.worktreePath, card.project.baseBranch, card.branchName, card.startSha);
    if (!status.hasRemote) throw new HttpError(409, 'This repository has no origin remote to push to.', 'GIT_ERROR');
    if (status.uncommittedFiles > 0) throw new HttpError(409, 'Commit your changes before pushing.', 'GIT_ERROR');
    if (status.commitsAhead === 0) throw new HttpError(409, 'Nothing to push: commit the changes first.', 'GIT_ERROR');
    if (status.remoteBranchExists && status.unpushedCommits === 0) {
      throw new HttpError(409, 'Nothing to push: origin already has these commits.', 'GIT_ERROR');
    }
    await pushBranch(card.worktreePath, card.branchName);
    const done = isShared(card) ? await workflowService.markPushedShared(cardId) : false;
    return { ok: true, branchName: card.branchName, done };
  },

  /** Branch-per-card: merges the latest base into the card branch (aborted on conflict). */
  async updateBase(cardId: string) {
    const card = await loadWorkingCard(cardId, { idle: true });
    if (isShared(card)) throw sharedOnly();
    const { merged, baseRef } = await mergeBaseInto(card.worktreePath, card.project.baseBranch);
    return { merged, baseRef };
  },

  /** Done card: remove its worktree, and its local branch once pushed. */
  async cleanup(cardId: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { project: true } });
    if (!card) throw notFound('Card');
    return cleanupCard(card);
  },

  /** Every Done card of the project that still has a worktree. Problems are reported, not thrown. */
  async cleanupDone(projectId: string) {
    const cards = await prisma.card.findMany({
      where: { projectId, status: 'DONE', worktreePath: { not: null }, startSha: null },
      include: { project: true },
    });
    let cleaned = 0;
    let deletedBranches = 0;
    const skipped: { title: string; reason: string }[] = [];
    for (const card of cards) {
      try {
        const result = await cleanupCard(card);
        cleaned += 1;
        if (result.deletedBranch) deletedBranches += 1;
        else if (result.keptBranchReason) skipped.push({ title: card.title, reason: `Branch kept: ${result.keptBranchReason}` });
      } catch (error) {
        skipped.push({ title: card.title, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return { cleaned, deletedBranches, skipped };
  },

  /**
   * With a GitHub token: open the PR through the API, save its link, move the
   * card to Done. Without one: return the compare URL to open in the browser.
   */
  async openPr(cardId: string, input: Required<OpenPrInput>): Promise<{ prUrl: string | null; compareUrl: string | null }> {
    const card = await loadWorkingCard(cardId, { idle: true });
    if (isShared(card)) {
      throw new HttpError(409, 'This project works on one shared branch: push it instead of opening a pull request per card.', 'GIT_ERROR');
    }
    if (card.prUrl) return { prUrl: card.prUrl, compareUrl: null };
    assertChecksConfirmed(card, input.checksFailingConfirmed);
    const risk = await riskService.assertReviewed(card, input.riskReviewed);
    const [status, origin, settings] = await Promise.all([
      getBranchStatus(card.worktreePath, card.project.baseBranch, card.branchName),
      originGithub(card.worktreePath),
      settingsService.row(),
    ]);
    const { github } = origin;
    if (!github) throw new HttpError(409, 'Pull requests need a github.com origin remote.', 'GIT_ERROR');
    if (!status.remoteBranchExists || status.unpushedCommits > 0 || status.uncommittedFiles > 0) {
      throw new HttpError(409, 'Commit and push the branch first.', 'GIT_ERROR');
    }
    if (!settings.githubToken) {
      return { prUrl: null, compareUrl: compareUrl(github, card.project.baseBranch, card.branchName) };
    }
    const prUrl = await openPullRequest({
      token: settings.githubToken,
      owner: github.owner,
      repo: github.repo,
      head: card.branchName,
      base: card.project.baseBranch,
      title: input.title,
      body: input.body,
    });
    // Best effort: the label helps whoever merges; the PR is open either way.
    if (risk?.level === 'HIGH') await addLabels(settings.githubToken, github.owner, github.repo, prUrl, ['high-risk']).catch(() => undefined);
    await workflowService.markPrOpened(cardId, prUrl);
    return { prUrl, compareUrl: null };
  },

  async reset(cardId: string) {
    const card = await loadWorkingCard(cardId, { idle: true });
    await resetChanges(card.worktreePath);
    return { ok: true };
  },
};
