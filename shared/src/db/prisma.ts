import { PrismaClient, Prisma } from '@prisma/client';
import { loadEnv } from '../config/env.js';

/**
 * A single PrismaClient per process. Re-using the client is what keeps the
 * connection pool bounded when the worker runs dozens of concurrent send jobs.
 */
const globalRef = globalThis as unknown as { __mailstrivePrisma?: PrismaClient };

function create(): PrismaClient {
  const env = loadEnv();
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
    datasources: { db: { url: env.DATABASE_URL } },
  });
}

export const prisma: PrismaClient = globalRef.__mailstrivePrisma ?? create();

if (process.env.NODE_ENV !== 'production') {
  globalRef.__mailstrivePrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export { Prisma, PrismaClient };
export * from '@prisma/client';
