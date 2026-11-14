import 'server-only';

/**
 * Machine-readable error codes. The client switches on `code` (never on the
 * message). Integration codes are prefixed by their scope (spec §10).
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'TRELLO_NOT_CONFIGURED'
  | 'TRELLO_UNAUTHORIZED'
  | 'TRELLO_NOT_FOUND'
  | 'TRELLO_RATE_LIMITED'
  | 'TRELLO_UNAVAILABLE'
  | 'INVALID_TRANSITION'
  | 'CONFIRMATION_REQUIRED'
  | 'REPO_NOT_CONFIGURED'
  | 'GIT_ERROR'
  | 'GITHUB_UNAUTHORIZED'
  | 'GITHUB_ERROR'
  | 'RUNNER_ERROR'
  | 'CLAUDE_NOT_READY'
  | 'INTERNAL';

/** Throw from services for any expected failure. The route wrapper turns it into JSON. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: ErrorCode = defaultCode(status),
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function defaultCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    default:
      return 'INTERNAL';
  }
}

export const badRequest = (message = 'Bad request', details?: unknown) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const forbidden = (message = 'Not allowed') => new HttpError(403, message, 'FORBIDDEN');
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (message = 'Conflict', details?: unknown) => new HttpError(409, message, 'CONFLICT', details);
export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, message, 'UNPROCESSABLE', details);
/** A board move the workflow doesn't allow (spec §9.2). */
export const invalidTransition = (message: string) => new HttpError(409, message, 'INVALID_TRANSITION');
