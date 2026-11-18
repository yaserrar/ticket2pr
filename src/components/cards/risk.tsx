'use client';

import * as React from 'react';
import { Danger, ShieldTick, Warning2 } from 'iconsax-react';
import { RISK_META, type RiskLevel } from '~/lib/risk';
import { cn } from '~/lib/utils';
import type { CardDto, CardRiskDto } from '~/types/card';

const TONE: Record<RiskLevel, { pill: string; box: string; text: string; icon: typeof Danger }> = {
  HIGH: { pill: 'border-danger/25 bg-danger-subtle text-danger-muted', box: 'border-danger/25', text: 'text-danger-muted', icon: Danger },
  MEDIUM: { pill: 'border-warning/30 bg-warning-subtle text-warning-muted', box: 'border-warning/30', text: 'text-warning-muted', icon: Warning2 },
  LOW: { pill: 'border-success/30 bg-success-subtle text-success-muted', box: 'border-success/25', text: 'text-success-muted', icon: ShieldTick },
};

export const riskTone = (level: RiskLevel) => TONE[level];

/** A card's changes need a careful review: high risk, not confirmed yet. */
export const needsRiskReview = (card: CardDto) => card.risk?.level === 'HIGH' && !card.risk.reviewedAt;

/** Changes tab: why the changes are high, medium or low risk, file by file. */
export function RiskPanel({ risk }: { risk: CardRiskDto }) {
  const tone = TONE[risk.level];
  const meta = RISK_META[risk.level];
  return (
    <section aria-label="Risk" className={cn('flex flex-col gap-2.5 rounded-xl border bg-fill-faint p-4', tone.box)}>
      <h3 className={cn('flex items-center gap-2 text-[13px] font-medium', tone.text)}>
        <tone.icon className="size-4 shrink-0" />
        {meta.label} · {meta.review.toLowerCase()}
      </h3>
      {risk.areas.length ? (
        <ul className="flex flex-col gap-2 text-[13px]">
          {risk.areas.map((area) => (
            <li key={area.key} className="flex flex-col gap-1">
              <span className="text-foreground">{area.label}</span>
              {area.files.length ? (
                <span className="flex flex-wrap gap-1">
                  {area.files.slice(0, 6).map((f) => (
                    <code key={f} className="rounded-sm bg-fill-raised px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
                      {f}
                    </code>
                  ))}
                  {area.files.length > 6 ? <span className="text-xs text-subtle-foreground">and {area.files.length - 6} more</span> : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {risk.level === 'LOW'
            ? 'Small text or style changes, nothing sensitive.'
            : 'Regular code changes, nothing in payments, login, the database or secrets.'}
        </p>
      )}
      {risk.level === 'HIGH' ? (
        <p className="text-xs text-subtle-foreground">
          {risk.reviewedAt ? 'You confirmed you reviewed these files.' : 'Push and pull request ask you to confirm you reviewed these files.'}
        </p>
      ) : null}
    </section>
  );
}

/** Git tab, high risk: the confirmation push and pull request need once. */
export function RiskReviewCheck({ card, checked, onChange }: { card: CardDto; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = React.useId();
  if (!needsRiskReview(card) || !card.risk) return null;
  const areas = card.risk.areas.filter((a) => a.level === 'HIGH').map((a) => a.label.toLowerCase());
  return (
    <div className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-[13px]">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-danger" />
      <label htmlFor={id} className="leading-relaxed text-danger-muted">
        I reviewed the high-risk files carefully ({areas.join(', ')}).
      </label>
    </div>
  );
}
