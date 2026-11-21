import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { mapSdkMessage } from './claude-messages';

// Only the fields the mapper reads; cast keeps the fixtures short.
const m = (msg: unknown) => msg as SDKMessage;

describe('mapSdkMessage', () => {
  it('reads the session id and says the run uses the subscription', () => {
    const out = mapSdkMessage(
      m({ type: 'system', subtype: 'init', session_id: 's-1', apiKeySource: 'none', claude_code_version: '2.1.325', model: 'claude-opus-5' }),
    );
    expect(out.sessionId).toBe('s-1');
    expect(out.events).toEqual([{ type: 'system', message: 'Claude Code 2.1.325 · claude-opus-5 · signed in with your Claude subscription' }]);
  });

  it('flags API-key sessions in the log', () => {
    const out = mapSdkMessage(m({ type: 'system', subtype: 'init', session_id: 's', apiKeySource: 'ANTHROPIC_API_KEY', claude_code_version: '2', model: 'x' }));
    expect(out.events[0]).toMatchObject({ message: expect.stringContaining('using ANTHROPIC_API_KEY') });
  });

  it('turns assistant content into text and tool calls, skipping thinking', () => {
    const out = mapSdkMessage(
      m({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'hmm' },
            { type: 'text', text: '  I will fix the footer.  ' },
            { type: 'tool_use', id: 'tu-1', name: 'Edit', input: { file_path: 'src/footer.html' } },
          ],
        },
      }),
    );
    expect(out.events).toEqual([
      { type: 'assistant_text', text: 'I will fix the footer.' },
      { type: 'tool_use', id: 'tu-1', name: 'Edit', input: { file_path: 'src/footer.html' } },
    ]);
  });

  it('maps tool results, joining text blocks and clipping long output', () => {
    const out = mapSdkMessage(
      m({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: [{ type: 'text', text: 'ok' }, { type: 'image' }], is_error: false },
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'x'.repeat(9000), is_error: true },
          ],
        },
      }),
    );
    expect(out.events[0]).toEqual({ type: 'tool_result', toolUseId: 'tu-1', output: 'ok\n[image]', isError: false });
    expect(out.events[1]).toMatchObject({ toolUseId: 'tu-2', isError: true });
    expect((out.events[1] as { output: string }).output).toMatch(/1000 more characters/);
  });

  it('reports account failures as fatal', () => {
    expect(mapSdkMessage(m({ type: 'assistant', error: 'authentication_failed', message: { content: [] } })).fatal).toBe('authentication_failed');
    const limit = mapSdkMessage(m({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1_800_000_000 } }));
    expect(limit.fatal).toBe('rate_limit');
    expect(limit.events[0]).toMatchObject({ type: 'info', message: expect.stringContaining('usage limit is reached') });
  });

  it('warns when close to the usage limit', () => {
    const out = mapSdkMessage(m({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', utilization: 0.83 } }));
    expect(out.events[0]).toMatchObject({ message: expect.stringContaining('83% used') });
    expect(out.fatal).toBeUndefined();
  });

  it('reads success and error results', () => {
    const ok = mapSdkMessage(
      m({ type: 'result', subtype: 'success', result: 'Changed the link.', num_turns: 4, total_cost_usd: 0.12, duration_ms: 30000, is_error: false }),
    );
    expect(ok.result).toEqual({
      summary: 'Changed the link.',
      numTurns: 4,
      durationMs: 30000,
      isError: false,
      error: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.12, models: [] },
    });

    const turns = mapSdkMessage(m({ type: 'result', subtype: 'error_max_turns', num_turns: 60, total_cost_usd: 1, duration_ms: 1, errors: [] }));
    expect(turns.result).toMatchObject({ isError: true, error: expect.stringContaining('60 turns') });
  });

  it('sums tokens over every model, most expensive model first', () => {
    const model = (costUSD: number, tokens: number) => ({
      inputTokens: tokens,
      outputTokens: tokens * 10,
      cacheReadInputTokens: tokens * 100,
      cacheCreationInputTokens: tokens * 20,
      costUSD,
    });
    const out = mapSdkMessage(
      m({
        type: 'result',
        subtype: 'success',
        result: 'Done.',
        num_turns: 9,
        total_cost_usd: 0.91,
        duration_ms: 1,
        is_error: false,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 },
        modelUsage: { 'claude-haiku-4-5': model(0.01, 10), 'claude-sonnet-4-5': model(0.9, 100) },
      }),
    );
    expect(out.result?.usage).toEqual({
      inputTokens: 110,
      outputTokens: 1100,
      cacheReadTokens: 11_000,
      cacheWriteTokens: 2200,
      costUsd: 0.91,
      models: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    });
  });

  it('ignores messages it does not need', () => {
    expect(mapSdkMessage(m({ type: 'stream_event' }))).toEqual({ events: [] });
  });
});
