import { z } from 'zod';

/**
 * Scope check, shared by the board and the server. A project in maintenance
 * covers bugs and small changes; new features need a new agreement with the
 * client. Claude reads each new card (and the repository, read-only) and says
 * which side it falls on; the developer always has the last word.
 */
export const SCOPE_VERDICTS = ['IN_SCOPE', 'OUT_OF_SCOPE', 'UNSURE'] as const;
export const scopeVerdictSchema = z.enum(SCOPE_VERDICTS);
export type ScopeVerdict = z.infer<typeof scopeVerdictSchema>;

/** Stored on the card: a verdict, or where the check is. */
export const SCOPE_STATUSES = ['CHECKING', ...SCOPE_VERDICTS, 'FAILED'] as const;
export const scopeStatusSchema = z.enum(SCOPE_STATUSES);
export type ScopeStatus = z.infer<typeof scopeStatusSchema>;

export const SCOPE_KINDS = ['BUG', 'SMALL_CHANGE', 'CONTENT', 'NEW_FEATURE', 'OTHER'] as const;
export const scopeKindSchema = z.enum(SCOPE_KINDS);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

export const SCOPE_SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
export const scopeSizeSchema = z.enum(SCOPE_SIZES);
export type ScopeSize = z.infer<typeof scopeSizeSchema>;

export const SCOPE_KIND_LABEL: Record<ScopeKind, string> = {
  BUG: 'Bug',
  SMALL_CHANGE: 'Small change',
  CONTENT: 'Content update',
  NEW_FEATURE: 'New feature',
  OTHER: 'Other',
};

export const SCOPE_SIZE_LABEL: Record<ScopeSize, string> = {
  SMALL: 'Small (hours)',
  MEDIUM: 'Medium (a day or two)',
  LARGE: 'Large (several days or more)',
};

/** Claude's answer, as the classifier returns it. */
export const scopeResultSchema = z.object({
  verdict: scopeVerdictSchema,
  kind: scopeKindSchema,
  size: scopeSizeSchema,
  reason: z.string().trim().min(1).max(2000),
  clientNote: z.string().trim().max(3000).default(''),
});
export type ScopeResult = z.infer<typeof scopeResultSchema>;

/** Used when a project has no rules of its own. Shown as the starting text in Project settings. */
export const DEFAULT_SCOPE_RULES = `In scope (covered by maintenance):
- Bug fixes: something that worked, or was delivered to work, is broken.
- Small changes to existing screens: wording, labels, colours, spacing, a field added to an existing form.
- Content and configuration updates.
- Small improvements to existing features, about a day of work or less.

Out of scope (needs a new agreement with the client):
- New features, modules, pages or user roles.
- New integrations with outside services (payments, external APIs, single sign-on…).
- Changes to the data model or business rules beyond a small tweak.
- Redesigns of a screen or a flow.
- Anything likely to take more than about a day.`;

/** What starting a new card does, given its scope check. */
export type ScopeGate =
  /** Start now. */
  | { kind: 'go' }
  /** No verdict yet (or the card changed since): check first, start if in scope. */
  | { kind: 'check' }
  /** Already being checked: start if in scope. */
  | { kind: 'wait' }
  /** Claude said no (or isn't sure, or the check failed): the developer decides. */
  | { kind: 'confirm'; title: string; message: string };

export type ScopeGateInput = {
  /** The project checks scope. */
  enabled: boolean;
  status: ScopeStatus | null;
  /** The card changed on Trello since the verdict. */
  stale: boolean;
  /** The developer started it anyway, or the client agreed to the new work. */
  approved: boolean;
  reason: string | null;
  error: string | null;
};

export function scopeGate(input: ScopeGateInput): ScopeGate {
  if (!input.enabled || input.approved) return { kind: 'go' };
  if (input.status === 'CHECKING') return { kind: 'wait' };
  if (!input.status || input.stale) return { kind: 'check' };
  switch (input.status) {
    case 'IN_SCOPE':
      return { kind: 'go' };
    case 'OUT_OF_SCOPE':
      return {
        kind: 'confirm',
        title: 'Claude thinks this is out of scope',
        message: `${input.reason ?? 'It looks like new work rather than maintenance.'} Start it anyway, or move it to Out of scope so the project manager can discuss it with the client.`,
      };
    case 'UNSURE':
      return {
        kind: 'confirm',
        title: 'Claude isn’t sure this is in scope',
        message: `${input.reason ?? 'The card could be maintenance or new work.'} Start it if you know it’s covered by maintenance.`,
      };
    case 'FAILED':
      return {
        kind: 'confirm',
        title: 'The scope check failed',
        message: `${input.error ?? 'Claude couldn’t classify this card.'} Start it anyway if you know it’s covered by maintenance, or check again from the card panel.`,
      };
  }
}
