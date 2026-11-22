import { describe, expect, it } from 'vitest';
import {
  addUsage,
  averageRunCost,
  budgetStatus,
  clockDuration,
  csvCell,
  formatTokens,
  periodRange,
  sumUsage,
  totalOf,
  usageByCard,
  usageCsv,
  usageDelta,
  type AgentUsage,
  type RunUsageRow,
} from './usage';

const usage = (over: Partial<AgentUsage> = {}): AgentUsage => ({
  inputTokens: 100,
  outputTokens: 2000,
  cacheReadTokens: 50_000,
  cacheWriteTokens: 8000,
  costUsd: 0.5,
  models: ['claude-sonnet-4-5'],
  ...over,
});

const run = (over: Partial<RunUsageRow & { cardId: string }> = {}): RunUsageRow & { cardId: string } => ({
  cardId: 'c1',
  kind: 'INITIAL',
  startedAt: '2026-11-18T10:00:00.000Z',
  endedAt: '2026-11-18T10:05:00.000Z',
  durationMs: 300_000,
  checksMs: 20_000,
  costUsd: 0.5,
  inputTokens: 100,
  outputTokens: 2000,
  cacheReadTokens: 50_000,
  cacheWriteTokens: 8000,
  ...over,
});

describe('usageDelta', () => {
  it('is the whole report for a new session', () => {
    expect(usageDelta(usage(), null)).toEqual(usage());
  });

  it('subtracts the earlier runs of a resumed session that carried its totals', () => {
    const previous = usage();
    const reported = usage({ inputTokens: 150, outputTokens: 2600, cacheReadTokens: 90_000, cacheWriteTokens: 9000, costUsd: 0.62 });
    expect(usageDelta(reported, previous)).toEqual({
      inputTokens: 50,
      outputTokens: 600,
      cacheReadTokens: 40_000,
      cacheWriteTokens: 1000,
      costUsd: 0.12,
      models: ['claude-sonnet-4-5'],
    });
  });

  it('keeps the report when the session restarted its totals', () => {
    const reported = usage({ inputTokens: 20, outputTokens: 300, costUsd: 0.05 });
    expect(usageDelta(reported, usage())).toEqual(reported);
  });

  it('adds usages for a session total', () => {
    expect(addUsage(usage(), usage({ models: ['claude-haiku-4-5'] }))).toMatchObject({ inputTokens: 200, costUsd: 1, models: ['claude-sonnet-4-5', 'claude-haiku-4-5'] });
    expect(addUsage(null, usage())).toEqual(usage());
  });
});

describe('sumUsage', () => {
  it('adds finished runs, counts fix rounds, and checks-only runs as time', () => {
    const totals = sumUsage([
      run(),
      run({ kind: 'FIX', durationMs: 60_000, checksMs: 15_000, costUsd: 0.1, inputTokens: 10, outputTokens: 500, cacheReadTokens: 10_000, cacheWriteTokens: 0 }),
      run({ kind: 'CHECKS', durationMs: 18_000, checksMs: 18_000, costUsd: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }),
      run({ startedAt: null, endedAt: '2026-11-18T11:00:00.000Z' }),
      run({ endedAt: null, durationMs: null }),
    ]);
    expect(totals).toEqual({
      runs: 2,
      fixRounds: 1,
      durationMs: 378_000,
      checksMs: 53_000,
      inputTokens: 110,
      outputTokens: 2500,
      cacheReadTokens: 60_000,
      cacheWriteTokens: 8000,
      tokens: 70_610,
      costUsd: 0.6,
    });
  });
});

describe('periods', () => {
  const now = new Date(2026, 10, 21, 15, 30); // Saturday 21 Nov 2026, local time

  it('starts weeks on Monday and months on the 1st', () => {
    expect(periodRange('week', now)).toEqual({ from: new Date(2026, 10, 16), to: null });
    expect(periodRange('month', now)).toEqual({ from: new Date(2026, 10, 1), to: null });
    expect(periodRange('last-month', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
    expect(periodRange('all', now)).toEqual({ from: null, to: null });
  });
});

describe('usageByCard', () => {
  const cards = [
    { cardId: 'c1', shortLink: 'aB12', title: 'Fix the footer', trelloUrl: 'https://trello.com/c/aB12', status: 'REVIEW' },
    { cardId: 'c2', shortLink: 'cD34', title: 'Contact form', trelloUrl: 'https://trello.com/c/cD34', status: 'DONE' },
    { cardId: 'c3', shortLink: 'eF56', title: 'Untouched', trelloUrl: 'https://trello.com/c/eF56', status: 'NEW' },
  ];
  const runs = [
    run({ cardId: 'c1', startedAt: new Date(2026, 10, 17, 9).toISOString() }),
    run({ cardId: 'c1', kind: 'FOLLOW_UP', startedAt: new Date(2026, 10, 18, 9).toISOString() }),
    run({ cardId: 'c2', startedAt: new Date(2026, 10, 20, 9).toISOString() }),
    run({ cardId: 'c2', startedAt: new Date(2026, 9, 28, 9).toISOString() }),
  ];

  it('groups the period’s runs per card, latest work first, with the period total', () => {
    const rows = usageByCard(cards, runs, periodRange('week', new Date(2026, 10, 21)));
    expect(rows.map((r) => [r.cardId, r.runs])).toEqual([
      ['c2', 1],
      ['c1', 2],
    ]);
    expect(rows[1]).toMatchObject({ firstRunAt: new Date(2026, 10, 17, 9).toISOString(), lastRunAt: new Date(2026, 10, 18, 9).toISOString(), costUsd: 1 });
    expect(totalOf(rows)).toMatchObject({ runs: 3, durationMs: 900_000, costUsd: 1.5 });
    expect(usageByCard(cards, runs, periodRange('all', new Date()))).toHaveLength(2);
  });

  it('exports one CSV line per card, safe for spreadsheets', () => {
    const rows = usageByCard([{ ...cards[0]!, title: '=HYPERLINK("x"), "quoted"' }], runs.slice(0, 1), periodRange('all', new Date()));
    const csv = usageCsv(rows, (s) => (s === 'REVIEW' ? 'Review' : s));
    const [header, line] = csv.trim().split('\r\n');
    expect(header).toContain('API-equivalent cost reported by Claude Code (USD)');
    expect(line).toMatch(/^"'=HYPERLINK\(""x""\), ""quoted""",https:\/\/trello\.com\/c\/aB12,Review,1,0,0:05:00,0\.08,0\.01,100,2000,50000,8000,0\.50,/);
  });
});

describe('formatting', () => {
  it('formats durations, tokens and cells', () => {
    expect(clockDuration(4_812_000)).toBe('1:20:12');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(18_420)).toBe('18.4k');
    expect(formatTokens(182_400)).toBe('182k');
    expect(formatTokens(1_250_000)).toBe('1.25M');
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell(-1)).toBe('-1');
  });
});

describe('averageRunCost', () => {
  it('divides the cost by the number of runs across cards', () => {
    expect(averageRunCost([{ runs: 3, costUsd: 1.5 }, { runs: 1, costUsd: 0.5 }])).toBe(0.5);
  });

  it('is 0 when nothing ran', () => {
    expect(averageRunCost([])).toBe(0);
    expect(averageRunCost([{ runs: 0, costUsd: 0 }])).toBe(0);
  });
});

describe('budgetStatus', () => {
  it('is ok under 80 % of the budget', () => {
    expect(budgetStatus(10, 50)).toBe('ok');
  });

  it('is near from 80 % of the budget', () => {
    expect(budgetStatus(40, 50)).toBe('near');
    expect(budgetStatus(45, 50)).toBe('near');
  });
});
