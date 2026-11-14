'use client';

import * as React from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { Button } from '~/components/ui/button';
import { ArchiveSlash, Edit2 } from 'iconsax-react';
import { RelativeTime } from '~/components/shared/relative-time';
import { formatDateTime } from '~/lib/format';
import type { CardDto } from '~/types/card';
import { CardMarkdown } from './card-markdown';
import { ChecklistView } from './checklist-view';
import { StatusPill } from './status-dot';

/** Details tab (spec §11.4): the Trello content, read-only, and an information table. */
export function DetailsTab({ card, sourceListName }: { card: CardDto; sourceListName: string }) {
  const [, setTab] = useQueryState('tab', parseAsString);
  return (
    <div className="flex flex-col gap-6">
      {card.removedFromTrello ? (
        <Notice icon={ArchiveSlash} tone="neutral">
          This card was archived or deleted on Trello. Its content here is the last version Ticket2PR saw.
        </Notice>
      ) : null}
      {card.changedOnTrello && !card.removedFromTrello ? (
        <Notice icon={Edit2} tone="warning">
          The client updated this card on Trello after work started. The content below is the latest version.{' '}
          <Button variant="link" size="xs" className="h-auto p-0 text-[13px] text-warning-muted underline" onClick={() => void setTab('client')}>
            See what changed
          </Button>
        </Notice>
      ) : null}

      <Section title="Description">
        {card.description.trim() ? (
          <CardMarkdown>{card.description}</CardMarkdown>
        ) : (
          <p className="text-[13px] text-subtle-foreground">No description on Trello.</p>
        )}
      </Section>

      {card.checklists.length ? (
        <Section title="Checklists">
          <div className="flex flex-col gap-5">
            {card.checklists.map((c) => (
              <ChecklistView key={c.id} checklist={c} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Information">
        <dl className="divide-y overflow-hidden rounded-xl border bg-fill-faint text-[13px]">
          <InfoRow label="Status">
            <StatusPill status={card.status} />
          </InfoRow>
          <InfoRow label="Trello list">
            {card.removedFromTrello ? 'Not on Trello' : card.inSourceList ? sourceListName : 'Moved to another list'}
          </InfoRow>
          {card.branchName ? (
            <InfoRow label="Branch">
              <span className="font-mono text-xs">{card.branchName}</span>
            </InfoRow>
          ) : null}
          <InfoRow label="Last activity on Trello">
            <RelativeTime date={card.trelloLastActivity} />
          </InfoRow>
          <InfoRow label="Imported">
            <span title={formatDateTime(card.createdAt)}>
              <RelativeTime date={card.createdAt} />
            </span>
          </InfoRow>
          <InfoRow label="Short link">
            <span className="font-mono text-xs">{card.shortLink}</span>
          </InfoRow>
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow font-medium text-subtle-foreground">{title}</h3>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-foreground">{children}</dd>
    </div>
  );
}

function Notice({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'warning' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'flex gap-2.5 rounded-xl border border-warning/25 bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-muted'
          : 'flex gap-2.5 rounded-xl border bg-fill px-3 py-2.5 text-[13px] text-muted-foreground'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
