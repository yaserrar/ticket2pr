import { ApiError } from '~/services/api/client';

/** Human-readable message for any error thrown by a service/hook. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    if (error.issues?.length) return error.issues.map((i) => i.message).join(' · ');
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

/** Maps API validation issues onto react-hook-form fields. */
export function applyFieldErrors(
  error: unknown,
  setError: (name: never, e: { type: string; message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.issues?.length) return false;
  for (const issue of error.issues) setError(issue.path as never, { type: 'server', message: issue.message });
  return true;
}
