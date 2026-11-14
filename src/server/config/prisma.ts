import 'server-only';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '~/generated/prisma/client';
import { env } from './env';

/**
 * Single Prisma client for the whole server, kept on `globalThis` so dev
 * hot-reloads reuse it. Prisma 7 talks to SQLite through the better-sqlite3
 * driver adapter. better-sqlite3 resolves a relative path from the working
 * directory (the project root), like the Prisma CLI does from `prisma.config.ts`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const createClient = () =>
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: env.DATABASE_URL.replace(/^file:/, '') }),
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

export const prisma = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
