/**
 * Checks what the user pasted in the Trello setup wizard, before anything is
 * sent to the server, so mistakes are explained right where they happen.
 *
 * - API key: 32 hex characters. The Power-Up page also shows a 64-character
 *   *Secret* right below it, which is the most common mix-up.
 * - Token: `ATTA` + ~72 characters (older tokens: 64 hex characters).
 */
export type KeyCheck = { value: string; status: 'empty' | 'ok' | 'secret' | 'invalid' };
export type TokenCheck = { value: string; status: 'empty' | 'ok' | 'looks-like-key' | 'invalid' };

const strip = (raw: string) => raw.replace(/\s+/g, '');

export function checkTrelloKey(raw: string): KeyCheck {
  const value = strip(raw);
  if (!value) return { value, status: 'empty' };
  if (/^[0-9a-f]{32}$/i.test(value)) return { value, status: 'ok' };
  if (/^[0-9a-f]{64}$/i.test(value)) return { value, status: 'secret' };
  return { value, status: 'invalid' };
}

export function checkTrelloToken(raw: string): TokenCheck {
  // Accept a copied sentence around the token ("…your token: ATTA…").
  const value = raw.match(/ATTA[A-Za-z0-9]{40,}/)?.[0] ?? strip(raw);
  if (!value) return { value, status: 'empty' };
  if (/^ATTA[A-Za-z0-9]{40,}$/.test(value) || /^[0-9a-f]{64}$/i.test(value)) return { value, status: 'ok' };
  if (/^[0-9a-f]{32}$/i.test(value)) return { value, status: 'looks-like-key' };
  return { value, status: 'invalid' };
}
