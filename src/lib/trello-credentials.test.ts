import { describe, expect, it } from 'vitest';
import { checkTrelloKey, checkTrelloToken } from './trello-credentials';

const KEY = '0123456789abcdef0123456789abcdef';
const SECRET = KEY + KEY;
const TOKEN = 'ATTA' + 'a1B2'.repeat(18);

describe('checkTrelloKey', () => {
  it('accepts a 32-character key, trimming spaces and line breaks', () => {
    expect(checkTrelloKey(`  ${KEY}\n`)).toEqual({ value: KEY, status: 'ok' });
  });

  it('recognises the Secret pasted by mistake', () => {
    expect(checkTrelloKey(SECRET).status).toBe('secret');
  });

  it('rejects anything else', () => {
    expect(checkTrelloKey('').status).toBe('empty');
    expect(checkTrelloKey('abc').status).toBe('invalid');
    expect(checkTrelloKey(TOKEN).status).toBe('invalid');
  });
});

describe('checkTrelloToken', () => {
  it('accepts an ATTA token and a legacy 64-character token', () => {
    expect(checkTrelloToken(TOKEN)).toEqual({ value: TOKEN, status: 'ok' });
    expect(checkTrelloToken(SECRET).status).toBe('ok');
  });

  it('extracts the token from a copied sentence', () => {
    expect(checkTrelloToken(`You have granted access. Here is your token:\n\n${TOKEN}\n`).value).toBe(TOKEN);
  });

  it('recognises the API key pasted by mistake', () => {
    expect(checkTrelloToken(KEY).status).toBe('looks-like-key');
  });

  it('rejects anything else', () => {
    expect(checkTrelloToken('').status).toBe('empty');
    expect(checkTrelloToken('ATTAshort').status).toBe('invalid');
  });
});
