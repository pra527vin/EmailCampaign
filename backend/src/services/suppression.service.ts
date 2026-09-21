import { prisma, normalizeEmail, type SuppressionReason } from '@mailstrive/shared';

/**
 * Suppression is enforced in three places on purpose: at import, at dispatch,
 * and one final check inside the send job. The last one matters most -- a
 * recipient can unsubscribe while their job is already sitting in the queue.
 */

export async function isSuppressed(email: string): Promise<boolean> {
  const entry = await prisma.suppressionEntry.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  });
  return entry !== null;
}

/** Returns the subset of the supplied addresses that are suppressed. */
export async function filterSuppressed(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();

  const normalized = [...new Set(emails.map(normalizeEmail))];
  const suppressed = new Set<string>();

  // Chunked so a very large list cannot blow the statement parameter limit.
  const chunkSize = 5_000;
  for (let index = 0; index < normalized.length; index += chunkSize) {
    const chunk = normalized.slice(index, index + chunkSize);
    const rows = await prisma.suppressionEntry.findMany({
      where: { email: { in: chunk } },
      select: { email: true },
    });
    for (const row of rows) suppressed.add(normalizeEmail(row.email));
  }

  return suppressed;
}

export async function suppress(params: {
  email: string;
  reason: SuppressionReason;
  source?: string;
  campaignId?: string | null;
  notes?: string;
}): Promise<void> {
  const email = normalizeEmail(params.email);
  await prisma.suppressionEntry.upsert({
    where: { email },
    create: {
      email,
      reason: params.reason,
      source: params.source ?? null,
      campaignId: params.campaignId ?? null,
      notes: params.notes ?? null,
    },
    // Keep the earliest suppression: the first reason is the authoritative one.
    update: {},
  });
}

export async function unsuppress(email: string): Promise<boolean> {
  const result = await prisma.suppressionEntry.deleteMany({
    where: { email: normalizeEmail(email) },
  });
  return result.count > 0;
}

export async function listSuppressions(params: {
  search?: string;
  reason?: SuppressionReason;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(params.search ? { email: { contains: normalizeEmail(params.search) } } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.suppressionEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.suppressionEntry.count({ where }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
