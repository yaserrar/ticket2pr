import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentUsage } from '~/lib/usage';
import type { RunEventPayload } from '~/types/run';
import type { UsageReport } from '~/server/modules/claude/usage.service';

/**
 * Agent SDK message → run log events (spec §7.2 `toRunEvents`). Pure, so the
 * mapping is unit-tested without starting Claude.
 */
export type ClaudeResult = {
  summary: string;
  numTurns: number;
  durationMs: number;
  isError: boolean;
  error: string | null;
  /** Tokens and API-equivalent cost, as reported: for a resumed session, it may include the session's earlier runs. */
  usage: AgentUsage;
};

export type MappedMessage = {
  events: RunEventPayload[];
  sessionId?: string;
  result?: ClaudeResult;
  /** An account-level failure (not signed in, usage limit): the run cannot succeed. */
  fatal?: string;
  /** A usage report from the subscription's rate limits. */
  usage?: UsageReport;
};

const MAX_OUTPUT_CHARS = 8000;

function clip(text: string) {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} more characters)` : text;
}

/** tool_result content is a string or a list of blocks; keep the text. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'type' in b && b.type === 'text' && 'text' in b ? String(b.text) : b && typeof b === 'object' && 'type' in b ? `[${String(b.type)}]` : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function formatReset(epochSeconds: number | undefined) {
  if (!epochSeconds) return '';
  const d = new Date(epochSeconds * 1000);
  return ` It resets at ${d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}.`;
}

/** Floating-point noise out of reported costs (micro-dollars are plenty). */
const roundCost = (usd: number) => Math.round(usd * 1e6) / 1e6;

/**
 * Tokens and API-equivalent cost of a result. `modelUsage` covers every model
 * call (subagents and compaction too); `usage` (main loop only) is the
 * fallback when it is missing.
 */
export function usageOfResult(msg: Pick<SDKResultMessage, 'modelUsage' | 'usage' | 'total_cost_usd'>): AgentUsage {
  const models = Object.entries(msg.modelUsage ?? {}).sort(([, a], [, b]) => b.costUSD - a.costUSD);
  if (models.length) {
    const sum = (key: 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens') =>
      models.reduce((n, [, m]) => n + (m[key] ?? 0), 0);
    return {
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheReadTokens: sum('cacheReadInputTokens'),
      cacheWriteTokens: sum('cacheCreationInputTokens'),
      costUsd: roundCost(msg.total_cost_usd ?? models.reduce((n, [, m]) => n + m.costUSD, 0)),
      models: models.map(([name]) => name),
    };
  }
  const u = msg.usage;
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    costUsd: roundCost(msg.total_cost_usd ?? 0),
    models: [],
  };
}

export function mapSdkMessage(msg: SDKMessage): MappedMessage {
  switch (msg.type) {
    case 'system': {
      if (msg.subtype === 'init') {
        const auth = !msg.apiKeySource || msg.apiKeySource === 'none' ? 'signed in with your Claude subscription' : `using ${msg.apiKeySource}`;
        return {
          sessionId: msg.session_id,
          events: [{ type: 'system', message: `Claude Code ${msg.claude_code_version} · ${msg.model} · ${auth}` }],
        };
      }
      if (msg.subtype === 'api_retry') {
        return { events: [{ type: 'info', message: `Claude API error (${msg.error}). Retrying ${msg.attempt}/${msg.max_retries}…` }] };
      }
      return { events: [] };
    }

    case 'assistant': {
      if (msg.error === 'authentication_failed' || msg.error === 'oauth_org_not_allowed') {
        return { events: [], fatal: 'authentication_failed' };
      }
      if (msg.error === 'rate_limit' || msg.error === 'billing_error') return { events: [], fatal: 'rate_limit' };
      const events: RunEventPayload[] = [];
      for (const block of msg.message.content ?? []) {
        if (block.type === 'text' && block.text.trim()) events.push({ type: 'assistant_text', text: block.text.trim() });
        else if (block.type === 'tool_use') {
          events.push({ type: 'tool_use', id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
        }
      }
      return { events };
    }

    case 'user': {
      const content = msg.message.content;
      if (!Array.isArray(content)) return { events: [] };
      const events: RunEventPayload[] = [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          events.push({ type: 'tool_result', toolUseId: block.tool_use_id, output: clip(resultText(block.content)), isError: Boolean(block.is_error) });
        }
      }
      return { events };
    }

    case 'rate_limit_event': {
      const info = msg.rate_limit_info;
      const usage: UsageReport = {
        status: info.status,
        utilization: info.utilization ?? null,
        resetsAt: info.resetsAt ?? null,
        limitType: info.rateLimitType ?? null,
      };
      if (info.status === 'rejected') {
        return {
          events: [{ type: 'info', message: `Your Claude usage limit is reached.${formatReset(info.resetsAt)}` }],
          fatal: 'rate_limit',
          usage,
        };
      }
      if (info.status === 'allowed_warning') {
        const pct = info.utilization !== undefined ? ` (${Math.round(info.utilization * 100)}% used)` : '';
        return { events: [{ type: 'info', message: `You are close to your Claude usage limit${pct}.${formatReset(info.resetsAt)}` }], usage };
      }
      return { events: [], usage };
    }

    case 'result': {
      if (msg.subtype === 'success') {
        return {
          result: {
            summary: msg.result?.trim() ?? '',
            numTurns: msg.num_turns,
            durationMs: msg.duration_ms,
            isError: msg.is_error,
            error: msg.is_error ? msg.result?.trim() || 'Claude Code reported an error.' : null,
            usage: usageOfResult(msg),
          },
          events: [],
        };
      }
      const error =
        msg.subtype === 'error_max_turns'
          ? `Stopped after ${msg.num_turns} turns, the limit. Retry to let it continue, or raise the limit in Settings.`
          : msg.subtype === 'error_max_budget_usd'
            ? 'Stopped: the budget for this run was reached.'
            : msg.errors?.filter(Boolean).join('\n') || 'Claude Code stopped with an error.';
      return {
        result: {
          summary: '',
          numTurns: msg.num_turns,
          durationMs: msg.duration_ms,
          isError: true,
          error,
          usage: usageOfResult(msg),
        },
        events: [],
      };
    }

    default:
      return { events: [] };
  }
}
