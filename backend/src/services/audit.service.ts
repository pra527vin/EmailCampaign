import { createLogger, prisma } from '@mailstrive/shared';

const log = createLogger('api:audit');

export interface AuditEntry {
  action: string;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Writes an audit row and mirrors it to the structured log.
 *
 * Audit writes must never break the request that triggered them, so failures
 * are logged and swallowed. The operation itself has already happened; losing
 * the audit row is strictly less bad than 500-ing a successful campaign start.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const payload = {
    action: entry.action,
    userId: entry.userId ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: (entry.metadata ?? undefined) as never,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  };

  try {
    await prisma.auditLog.create({ data: payload });
    log.info({ audit: { action: entry.action, entityType: entry.entityType, entityId: entry.entityId } }, entry.action);
  } catch (error) {
    log.error({ err: error, action: entry.action }, 'Failed to persist audit log');
  }
}

export async function listAuditLogs(params: {
  userId?: string;
  action?: string;
  entityId?: string;
  page: number;
  pageSize: number;
}) {
  const { page, pageSize } = params;
  const where = {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.entityId ? { entityId: params.entityId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
