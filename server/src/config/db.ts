import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

// Logs every generated SQL statement in development — the way to prove that a query's
// filtering/sorting/paging happened as WHERE/ORDER BY/LIMIT/OFFSET in Postgres, not in Node.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: config.NODE_ENV === 'development' ? ['query'] : [] });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
