import { z } from 'zod';

/**
 * Risk flag on a card's changes: how carefully they must be reviewed before
 * merging. Decided from the diff with plain rules (no model), so it is fast,
 * free and explainable: every reason names the files behind it.
 *
 *   HIGH    payments, login and accounts, database and migrations, secrets and
 *           deployment, or paths the project marks as sensitive → careful review
 *   MEDIUM  regular code changes, dependencies, large diffs
 *   LOW     small text or style changes → quick review
 */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const riskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const riskAreaSchema = z.object({
  key: z.string(),
  label: z.string(),
  level: z.enum(['MEDIUM', 'HIGH']),
  files: z.array(z.string()),
});
export type RiskArea = z.infer<typeof riskAreaSchema>;

export const riskDetailsSchema = z.object({
  areas: z.array(riskAreaSchema),
  stats: z.object({ files: z.number(), lines: z.number() }),
});
export type RiskDetails = z.infer<typeof riskDetailsSchema>;
export type RiskAssessment = RiskDetails & { level: RiskLevel };

export type RiskFile = { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; additions: number; deletions: number };

/** A word in a path: between separators, so `payment.ts` and `api/auth/` match but `authors.md` doesn't. */
const word = (words: string) => new RegExp(`(^|[/._-])(${words})([/._-]|$)`, 'i');

const AREAS: { key: string; label: string; level: 'MEDIUM' | 'HIGH'; test: (path: string) => boolean }[] = [
  {
    key: 'payments',
    label: 'Payments',
    level: 'HIGH',
    test: (p) => word('pay|payments?|billing|checkout|stripe|paypal|cmi|invoices?|subscriptions?|refunds?|wallet|pricing').test(p),
  },
  {
    key: 'auth',
    label: 'Login and accounts',
    level: 'HIGH',
    test: (p) => word('auth|authentication|login|logout|sign-?in|sign-?up|sessions?|passwords?|oauth|jwt|permissions?|roles?|guards?|acl|middleware').test(p),
  },
  {
    key: 'database',
    label: 'Database and migrations',
    level: 'HIGH',
    test: (p) => /(^|\/)(migrations?|migrate)\//i.test(p) || /schema\.prisma$|\.sql$/i.test(p) || word('seeds?|knexfile|ormconfig|drizzle').test(p),
  },
  {
    key: 'secrets',
    label: 'Secrets and deployment',
    level: 'HIGH',
    test: (p) =>
      /(^|\/)\.env/i.test(p) ||
      word('secrets?|credentials?').test(p) ||
      /(^|\/)\.github\/workflows\//i.test(p) ||
      /(^|\/)(dockerfile|docker-compose[^/]*)$/i.test(p) ||
      /(^|\/)(deploy|k8s|terraform|nginx)\//i.test(p),
  },
  {
    key: 'dependencies',
    label: 'Dependencies',
    level: 'MEDIUM',
    test: (p) => /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements\.txt|composer\.(json|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$/.test(p),
  },
];

/** Tests don't change behaviour: they never make a change high risk. */
const isTest = (p: string) => /(\.|_)(test|spec)\.[a-z]+$|(^|\/)(__tests__|e2e|tests?)\//i.test(p);

/** Text and styles: copy, translations, stylesheets, docs, images. */
const isTextOrStyle = (p: string) =>
  /\.(css|scss|sass|less|md|mdx|txt|svg|png|jpe?g|gif|webp|ico)$/i.test(p) || /(^|\/)(locales?|i18n|lang|messages|translations?)\//i.test(p);

const SMALL = { files: 3, lines: 30 };
const LARGE = { files: 20, lines: 500 };

/** `src/billing/**`, `*.sql`, or a plain path fragment (`src/payments`). */
export function pathMatcher(pattern: string): (path: string) => boolean {
  const p = pattern.trim().replace(/^\.?\//, '');
  if (!p) return () => false;
  if (!/[*?]/.test(p)) return (path) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || path.includes(`/${p}`);
  const source = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0002')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0002/g, '.*');
  const re = new RegExp(`(^|/)${source}$`, 'i');
  return (path) => re.test(path);
}

/** Project setting: one pattern per line, `#` for comments. */
export function parseRiskPaths(text: string | null | undefined) {
  return (text ?? '')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
}

export function assessRisk(files: RiskFile[], extraPaths: string[] = []): RiskAssessment {
  const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const stats = { files: files.length, lines };
  const custom = extraPaths.map(pathMatcher);
  const areas = new Map<string, RiskArea>();
  const add = (key: string, label: string, level: 'MEDIUM' | 'HIGH', file: string) => {
    const area = areas.get(key) ?? { key, label, level, files: [] };
    if (!area.files.includes(file)) area.files.push(file);
    areas.set(key, area);
  };

  for (const { path } of files) {
    if (custom.some((m) => m(path))) add('custom', 'Marked sensitive in Project settings', 'HIGH', path);
    if (isTest(path)) continue;
    for (const area of AREAS) if (area.test(path)) add(area.key, area.label, area.level, path);
  }
  if (lines > LARGE.lines || files.length > LARGE.files) {
    areas.set('size', { key: 'size', label: `Large change: ${lines} lines in ${files.length} files`, level: 'MEDIUM', files: [] });
  }

  const list = [...areas.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'HIGH' ? -1 : 1));
  if (list.some((a) => a.level === 'HIGH')) return { level: 'HIGH', areas: list, stats };
  if (list.length) return { level: 'MEDIUM', areas: list, stats };

  const textOnly = files.length > 0 && files.every((f) => isTextOrStyle(f.path) || isTest(f.path));
  const small = files.length <= SMALL.files && lines <= SMALL.lines;
  const removesFiles = files.some((f) => f.status === 'deleted');
  if ((textOnly || small) && !removesFiles) return { level: 'LOW', areas: [], stats };
  return { level: 'MEDIUM', areas: [], stats };
}

export const RISK_META: Record<RiskLevel, { label: string; review: string }> = {
  HIGH: { label: 'High risk', review: 'Careful review before merging' },
  MEDIUM: { label: 'Medium risk', review: 'Normal review' },
  LOW: { label: 'Low risk', review: 'Quick review' },
};

/** The Risk section of a pull request description. */
export function riskMarkdown(risk: RiskAssessment, reviewedBy?: string | null) {
  const meta = RISK_META[risk.level];
  const lines = [`## Risk: ${meta.label.replace(' risk', '')} · ${meta.review.toLowerCase()}`];
  for (const area of risk.areas) {
    const files = area.files.slice(0, 8).map((f) => `\`${f}\``);
    const more = area.files.length > 8 ? ` and ${area.files.length - 8} more` : '';
    lines.push(`- **${area.label}**${files.length ? `: ${files.join(', ')}${more}` : ''}`);
  }
  if (!risk.areas.length) lines.push(`- ${risk.stats.lines} lines in ${risk.stats.files} file${risk.stats.files === 1 ? '' : 's'}.`);
  if (risk.level === 'HIGH' && reviewedBy !== undefined) lines.push('', `High-risk files reviewed${reviewedBy ? ` by ${reviewedBy}` : ''} before pushing.`);
  return lines.join('\n');
}
