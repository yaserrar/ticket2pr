import { route } from '~/server/http/route';
import { prisma } from '~/server/config/prisma';

export const GET = route({}, async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
});
