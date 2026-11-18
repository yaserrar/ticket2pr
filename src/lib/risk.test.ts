import { describe, expect, it } from 'vitest';
import { assessRisk, parseRiskPaths, pathMatcher, riskMarkdown, type RiskFile } from './risk';

const file = (path: string, lines = 4, status: RiskFile['status'] = 'modified'): RiskFile => ({ path, status, additions: lines, deletions: 0 });

describe('assessRisk', () => {
  it('flags payments, login, migrations and secrets as high risk, naming the files', () => {
    const risk = assessRisk([file('src/payments/cmi.ts'), file('app/api/auth/[...nextauth]/route.ts'), file('src/components/Button.tsx')]);
    expect(risk.level).toBe('HIGH');
    expect(risk.areas.map((a) => a.key)).toEqual(['payments', 'auth']);
    expect(risk.areas[0]!.files).toEqual(['src/payments/cmi.ts']);
    expect(assessRisk([file('prisma/migrations/20260101_add/migration.sql')]).level).toBe('HIGH');
    expect(assessRisk([file('prisma/schema.prisma')]).level).toBe('HIGH');
    expect(assessRisk([file('.env.example')]).level).toBe('HIGH');
    expect(assessRisk([file('.github/workflows/deploy.yml')]).level).toBe('HIGH');
    expect(assessRisk([file('src/pages/login.tsx', 2)]).level).toBe('HIGH');
  });

  it('does not match words inside other words, or tests', () => {
    expect(assessRisk([file('src/authors.md')]).level).toBe('LOW');
    expect(assessRisk([file('src/styles/tokens.css')]).level).toBe('LOW');
    expect(assessRisk([file('src/payments/cmi.test.ts')]).level).toBe('LOW');
  });

  it('gives small text and style changes a low risk', () => {
    expect(assessRisk([file('src/components/Footer.tsx', 2)]).level).toBe('LOW');
    expect(assessRisk([file('src/styles/site.css', 120), file('locales/fr/common.json', 80)]).level).toBe('LOW');
  });

  it('keeps regular code, dependencies, deletions and large changes at medium', () => {
    expect(assessRisk([file('src/a.ts', 20), file('src/b.ts', 20)]).level).toBe('MEDIUM');
    expect(assessRisk([file('package.json', 1)])).toMatchObject({ level: 'MEDIUM', areas: [{ key: 'dependencies' }] });
    expect(assessRisk([file('src/old.ts', 1, 'deleted')]).level).toBe('MEDIUM');
    expect(assessRisk([file('src/big.ts', 600)])).toMatchObject({ level: 'MEDIUM', areas: [{ key: 'size' }] });
  });

  it('adds the project’s own sensitive paths', () => {
    const risk = assessRisk([file('src/server/reports/export.ts', 2)], ['src/server/reports/**']);
    expect(risk).toMatchObject({ level: 'HIGH', areas: [{ key: 'custom', files: ['src/server/reports/export.ts'] }] });
  });
});

describe('pathMatcher', () => {
  it('handles globs and plain path fragments', () => {
    expect(pathMatcher('src/billing/**')('src/billing/a/b.ts')).toBe(true);
    expect(pathMatcher('*.sql')('db/init.sql')).toBe(true);
    expect(pathMatcher('**/rates.ts')('src/x/rates.ts')).toBe(true);
    expect(pathMatcher('src/payroll')('src/payroll/run.ts')).toBe(true);
    expect(pathMatcher('src/payroll')('src/payrolls.ts')).toBe(false);
  });

  it('reads one pattern per line and ignores comments', () => {
    expect(parseRiskPaths('src/a/**\n# note\n\n  *.sql # db')).toEqual(['src/a/**', '*.sql']);
  });
});

describe('riskMarkdown', () => {
  it('writes the Risk section of the pull request', () => {
    const md = riskMarkdown(assessRisk([file('src/payments/cmi.ts')]), 'yaserrar');
    expect(md).toContain('## Risk: High · careful review before merging');
    expect(md).toContain('- **Payments**: `src/payments/cmi.ts`');
    expect(md).toContain('reviewed by yaserrar');
  });
});
