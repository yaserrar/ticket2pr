import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z, type ZodType } from 'zod';
import { Prisma } from '~/generated/prisma/client';
import { logger } from '../config/logger';
import { isProd } from '../config/env';
import { HttpError, forbidden } from './errors';

/**
 * The single wrapper every Route Handler goes through:
 *
 *   export const POST = route(
 *     { params: projectParams, body: syncBody },
 *     ({ params, body }) => syncService.syncProject(params.projectId, body.trigger),
 *   );
 *
 * - `body` / `query` / `params`: Zod schemas; parsed values are handed to the handler
 * - `status`: HTTP status for successful JSON responses (default 200)
 *
 * There is no auth (spec §12): the app only listens on 127.0.0.1. The wrapper
 * still rejects requests whose Host or Origin is not loopback, so a web page
 * can't drive the local API (DNS rebinding, cross-site form posts).
 *
 * Handlers return plain data (serialised as JSON) or a `Response`.
 * Services throw `HttpError`; Zod and Prisma errors are mapped here.
 */
type Schema = ZodType | undefined;
type Infer<S> = S extends ZodType ? z.output<S> : undefined;

export type RouteOptions = {
  body?: Schema;
  query?: Schema;
  params?: Schema;
  status?: number;
};

export type HandlerContext<O extends RouteOptions> = {
  req: NextRequest;
  body: Infer<O['body']>;
  query: Infer<O['query']>;
  params: O['params'] extends ZodType ? Infer<O['params']> : Record<string, string>;
};

type NextRouteContext = { params: Promise<Record<string, string | string[]>> };

export function route<const O extends RouteOptions>(
  options: O,
  handler: (ctx: HandlerContext<O>) => unknown | Promise<unknown>,
) {
  return async (req: NextRequest, context: NextRouteContext): Promise<Response> => {
    try {
      assertLocalRequest(req);

      const rawParams = ((await context?.params) ?? {}) as Record<string, string>;
      const params = options.params ? options.params.parse(rawParams) : rawParams;
      const query = options.query ? options.query.parse(searchParamsToObject(req.nextUrl.searchParams)) : undefined;
      const body = options.body ? options.body.parse(await readJson(req)) : undefined;

      const result = await handler({ req, body, query, params } as HandlerContext<O>);

      if (result instanceof Response) return result;
      return NextResponse.json(result === undefined ? { ok: true } : result, { status: options.status ?? 200 });
    } catch (error) {
      return toErrorResponse(error, req);
    }
  };
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(value: string) {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return '';
  }
}

function assertLocalRequest(req: NextRequest) {
  const host = req.headers.get('host');
  if (host && !LOOPBACK.has(hostnameOf(host))) throw forbidden('Ticket2PR only answers on localhost');
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null' && !LOOPBACK.has(hostnameOf(origin))) {
    throw forbidden('Cross-origin requests are not allowed');
  }
}

/** Maps any thrown value to a JSON error response `{ message, code, details?, issues? }`. */
export function toErrorResponse(error: unknown, req?: NextRequest): Response {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { message: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        message: 'Some fields are invalid',
        code: 'VALIDATION_ERROR',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { message: 'This already exists', code: 'CONFLICT', details: error.meta?.target },
        { status: 409 },
      );
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ message: 'Resource not found', code: 'NOT_FOUND' }, { status: 404 });
    }
  }

  logger.error({ err: error, path: req?.nextUrl.pathname, method: req?.method }, 'Unhandled route error');
  const message = !isProd && error instanceof Error ? error.message : 'Something went wrong on our side';
  return NextResponse.json({ message, code: 'INTERNAL' }, { status: 500 });
}

async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON', 'BAD_REQUEST');
  }
}

/** Repeated keys become arrays (`?label=a&label=b` → `{ label: ['a','b'] }`). */
export function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : all[0]!;
  }
  return out;
}
