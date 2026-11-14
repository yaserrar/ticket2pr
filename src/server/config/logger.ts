import 'server-only';
import pino from 'pino';

/**
 * Structured logger. Never log Trello keys or tokens: pass ids instead.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: 'ticket2pr' },
  redact: {
    paths: ['key', '*.key', 'token', '*.token', 'trelloApiKey', '*.trelloApiKey', 'trelloToken', '*.trelloToken'],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
