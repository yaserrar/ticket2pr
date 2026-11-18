import { describe, expect, it } from 'vitest';
import { scopeGate, type ScopeGateInput } from './scope';

const gate = (extra: Partial<ScopeGateInput>) =>
  scopeGate({ enabled: true, status: null, stale: false, approved: false, reason: null, error: null, ...extra });

describe('scopeGate', () => {
  it('lets every card start when the project does not check scope', () => {
    expect(gate({ enabled: false, status: 'OUT_OF_SCOPE' })).toEqual({ kind: 'go' });
  });

  it('starts cards Claude found in scope, or that the developer approved', () => {
    expect(gate({ status: 'IN_SCOPE' })).toEqual({ kind: 'go' });
    expect(gate({ status: 'OUT_OF_SCOPE', approved: true })).toEqual({ kind: 'go' });
    expect(gate({ status: null, approved: true })).toEqual({ kind: 'go' });
  });

  it('checks first when there is no verdict, or the card changed since', () => {
    expect(gate({ status: null })).toEqual({ kind: 'check' });
    expect(gate({ status: 'IN_SCOPE', stale: true })).toEqual({ kind: 'check' });
    expect(gate({ status: 'OUT_OF_SCOPE', stale: true })).toEqual({ kind: 'check' });
    expect(gate({ status: 'CHECKING' })).toEqual({ kind: 'wait' });
  });

  it('asks the developer when Claude says no, is unsure, or failed', () => {
    const out = gate({ status: 'OUT_OF_SCOPE', reason: 'A new payment module.' });
    expect(out).toMatchObject({ kind: 'confirm', title: expect.stringMatching(/out of scope/) });
    expect(out.kind === 'confirm' && out.message).toMatch(/^A new payment module\./);
    expect(gate({ status: 'UNSURE' }).kind).toBe('confirm');
    expect(gate({ status: 'FAILED', error: 'Timed out.' })).toMatchObject({ kind: 'confirm', message: expect.stringMatching(/^Timed out\./) });
  });
});
