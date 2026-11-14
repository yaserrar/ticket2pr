import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError } from '~/server/http/errors';
import { presentSettings } from '~/server/presenters/settings.presenter';
import { createTrelloClient, type TrelloCredentials } from '~/server/modules/trello/trello.client';
import { githubLogin } from '~/server/modules/github/github.client';
import type { TestTrelloInput, UpdateSettingsInput } from '~/schemas/settings';
import type { TrelloMemberDto } from '~/types/trello';

const SETTINGS_ID = 1;

/** The singleton settings row, created on first access. */
async function getRow() {
  return prisma.settings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
}

export const settingsService = {
  /** The raw row (server-side only: contains secrets). */
  row: getRow,

  async get() {
    return presentSettings(await getRow());
  },

  /**
   * Updates settings. New Trello credentials are verified against Trello
   * before they are stored, so stored credentials always worked once.
   */
  async update(input: UpdateSettingsInput) {
    let trello: { trelloApiKey: string; trelloToken: string; trelloUsername: string } | undefined;
    if (input.trelloApiKey && input.trelloToken) {
      const member = await createTrelloClient({ key: input.trelloApiKey, token: input.trelloToken }).me();
      trello = { trelloApiKey: input.trelloApiKey, trelloToken: input.trelloToken, trelloUsername: member.username };
    }
    // A new GitHub token is checked before it is stored; `null` removes it.
    if (input.githubToken) await githubLogin(input.githubToken);
    await getRow();
    const row = await prisma.settings.update({
      where: { id: SETTINGS_ID },
      data: {
        ...trello,
        ...(input.githubToken !== undefined ? { githubToken: input.githubToken } : {}),
        ...(input.pollIntervalSec !== undefined ? { pollIntervalSec: input.pollIntervalSec } : {}),
        ...(input.maxParallelRuns !== undefined ? { maxParallelRuns: input.maxParallelRuns } : {}),
        ...(input.claudeModel !== undefined ? { claudeModel: input.claudeModel === 'default' ? null : input.claudeModel } : {}),
        ...(input.maxTurns !== undefined ? { maxTurns: input.maxTurns } : {}),
      },
    });
    // More slots may start queued runs right away.
    if (input.maxParallelRuns !== undefined) void import('~/server/modules/runs/run-queue').then((m) => m.kickQueue());
    return presentSettings(row);
  },

  async disconnectTrello() {
    await getRow();
    const row = await prisma.settings.update({
      where: { id: SETTINGS_ID },
      data: { trelloApiKey: null, trelloToken: null, trelloUsername: null },
    });
    return presentSettings(row);
  },

  /** Tests the given credentials, or the stored ones when none are given. */
  async testTrello(input: TestTrelloInput): Promise<TrelloMemberDto> {
    const credentials =
      input.trelloApiKey && input.trelloToken
        ? { key: input.trelloApiKey, token: input.trelloToken }
        : await this.trelloCredentials();
    const member = await createTrelloClient(credentials).me();
    return { id: member.id, username: member.username, fullName: member.fullName };
  },

  /** Stored credentials, or a `TRELLO_NOT_CONFIGURED` error. */
  async trelloCredentials(): Promise<TrelloCredentials> {
    const row = await getRow();
    if (!row.trelloApiKey || !row.trelloToken) {
      throw new HttpError(409, 'Connect Trello in Settings first.', 'TRELLO_NOT_CONFIGURED');
    }
    return { key: row.trelloApiKey, token: row.trelloToken };
  },
};
