/**
 * Typed fetch client for the app's own Route Handlers (`/api/*`).
 * The API is local (no auth), so there is no token handling here.
 * Components never call this directly: component → hook → service → client.
 */
export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'INTERNAL',
    public readonly details?: unknown,
    public readonly issues?: ApiIssue[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

type RequestOptions = {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

const BASE = '/api';

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${BASE}${path}`, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
  }
  return typeof window === 'undefined' ? url.toString() : `${url.pathname}${url.search}`;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(buildUrl(path, options.query), {
    method,
    credentials: 'same-origin',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.message ?? res.statusText ?? 'Request failed',
      payload?.code,
      payload?.details,
      payload?.issues,
    );
  }

  return (isJson ? payload : await res.text()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body: body ?? {}, query }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { body: form }),
  url: buildUrl,
};
