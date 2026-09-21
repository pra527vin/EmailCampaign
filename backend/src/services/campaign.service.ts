import {
  AppError,
  createLogger,
  dispatchJobId,
  enqueueOrFail,
  getCampaignDispatchQueue,
  loadEnv,
  prisma,
  rangeBounds,
  type CampaignRecipientStatus,
  type CampaignStatus,
  type Paginated,
  type CampaignProgress,
  type DashboardRange,
} from '@mailstrive/shared';
import { canTransition, isActive, RETRYABLE_RECIPIENT_STATUSES } from './campaign-state.js';
import { filterSuppressed } from './suppression.service.js';
import { recordAudit } from './audit.service.js';

const log = createLogger('api:campaigns');

const MATERIALISE_BATCH_SIZE = 2_000;

type Context = { ipAddress?: string | undefined; userAgent?: string | undefined };

export interface CreateCampaignInput {
  name: string;
  listId: string;
  templateId: string;
  subject: string;
  fromName?: string | undefined;
  replyToEmail?: string | undefined;
  sendRatePerSecond?: number | undefined;
}

async function requireCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) throw AppError.notFound('Campaign');
  return campaign;
}

/** Applies a status change, rejecting anything the transition table forbids. */
function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw AppError.conflict(`A campaign in status ${from} cannot move to ${to}`);
  }
}

export async function createCampaign(
  userId: string,
  input: CreateCampaignInput,
  context: Context,
) {
  const env = loadEnv();

  const [list, template] = await Promise.all([
    prisma.recipientList.findFirst({
      where: { id: input.listId, userId },
      include: { _count: { select: { recipients: true } } },
    }),
    prisma.emailTemplate.findFirst({ where: { id: input.templateId, userId } }),
  ]);

  if (!list) throw AppError.notFound('Recipient list');
  if (!template) throw AppError.notFound('Template');
  if (list.status !== 'READY') {
    throw AppError.badRequest('The recipient list is still importing or failed to import');
  }
  if (list._count.recipients === 0) {
    throw AppError.badRequest('The recipient list has no recipients');
  }
  if (template.status === 'INACTIVE') {
    throw AppError.badRequest('The selected template is inactive. Activate it before using it.');
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: input.name,
      listId: input.listId,
      templateId: input.templateId,
      subject: input.subject,
      fromEmail: env.SES_FROM_EMAIL,
      fromName: input.fromName ?? env.SES_FROM_NAME ?? null,
      replyToEmail: input.replyToEmail ?? env.SES_REPLY_TO_EMAIL ?? null,
      sendRatePerSecond: input.sendRatePerSecond ?? null,
      status: 'DRAFT',
      totalRecipients: 0,
    },
  });

  await recordAudit({
    action: 'campaign.created',
    userId,
    entityType: 'campaign',
    entityId: campaign.id,
    metadata: { name: campaign.name, listId: input.listId, templateId: input.templateId },
    ...context,
  });

  return campaign;
}

export async function updateCampaign(
  userId: string,
  campaignId: string,
  input: Partial<CreateCampaignInput>,
  context: Context,
) {
  const campaign = await requireCampaign(userId, campaignId);

  // Once a campaign has been started its definition is frozen: recipients have
  // already received messages built from it, and changing it would make the
  // campaign history meaningless.
  if (campaign.status !== 'DRAFT') {
    throw AppError.conflict('Only draft campaigns can be edited');
  }

  if (input.listId) {
    const list = await prisma.recipientList.findFirst({ where: { id: input.listId, userId } });
    if (!list) throw AppError.notFound('Recipient list');
  }
  if (input.templateId) {
    const template = await prisma.emailTemplate.findFirst({
      where: { id: input.templateId, userId },
    });
    if (!template) throw AppError.notFound('Template');
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.listId ? { listId: input.listId } : {}),
      ...(input.templateId ? { templateId: input.templateId } : {}),
      ...(input.fromName !== undefined ? { fromName: input.fromName || null } : {}),
      ...(input.replyToEmail !== undefined ? { replyToEmail: input.replyToEmail || null } : {}),
      ...(input.sendRatePerSecond !== undefined
        ? { sendRatePerSecond: input.sendRatePerSecond ?? null }
        : {}),
    },
  });

  await recordAudit({
    action: 'campaign.updated',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    ...context,
  });

  return updated;
}

/**
 * Creates the `campaign_recipients` rows for a campaign.
 *
 * Idempotent: `skipDuplicates` plus the (campaign_id, recipient_id) unique
 * index means calling it again after a partial failure tops up the missing rows
 * rather than duplicating work. Suppressed addresses are written as SKIPPED so
 * the campaign record still shows that they were considered.
 */
async function materialiseRecipients(campaignId: string, listId: string): Promise<{
  eligible: number;
  skipped: number;
}> {
  let cursor: string | undefined;
  let eligible = 0;
  let skipped = 0;

  for (;;) {
    const batch = await prisma.recipient.findMany({
      where: { listId },
      orderBy: { id: 'asc' },
      take: MATERIALISE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, email: true },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]?.id;

    const suppressed = await filterSuppressed(batch.map((recipient) => recipient.email));

    const rows = batch.map((recipient) => {
      const isSuppressed = suppressed.has(recipient.email.toLowerCase());
      if (isSuppressed) skipped += 1;
      else eligible += 1;

      return {
        campaignId,
        recipientId: recipient.id,
        email: recipient.email,
        status: (isSuppressed ? 'SKIPPED' : 'PENDING') as CampaignRecipientStatus,
        ...(isSuppressed
          ? { errorCode: 'SUPPRESSED', errorMessage: 'Address is on the suppression list' }
          : {}),
      };
    });

    await prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true });

    if (batch.length < MATERIALISE_BATCH_SIZE) break;
  }

  return { eligible, skipped };
}

/** Enqueues the dispatcher. The epoch keeps each run's job id distinct. */
async function enqueueDispatch(campaignId: string, resume: boolean): Promise<void> {
  // Fails fast if Redis is down rather than leaving the request hanging.
  await enqueueOrFail(() =>
    getCampaignDispatchQueue().add(
      'dispatch',
      { campaignId, resume },
      { jobId: dispatchJobId(campaignId, Date.now()) },
    ),
  );
}

/**
 * Enqueues the dispatcher, restoring the previous status if the queue refuses.
 *
 * The status has to be written before the enqueue -- a dispatch job that starts
 * while the row still says DRAFT would see a campaign that is not running and
 * exit. But that ordering means a Redis outage would otherwise strand the
 * campaign in QUEUED, where `startCampaign` rejects it as "already running" and
 * nothing short of a worker restart could recover it. Rolling back leaves the
 * operator exactly where they began, free to press Start again.
 */
async function enqueueDispatchOrRollback(
  campaignId: string,
  resume: boolean,
  previousStatus: CampaignStatus,
): Promise<void> {
  try {
    await enqueueDispatch(campaignId, resume);
  } catch (error) {
    await prisma.campaign
      .update({
        where: { id: campaignId },
        data: {
          status: previousStatus,
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Failed to queue',
        },
      })
      .catch((revertError: unknown) => {
        log.error({ err: revertError, campaignId }, 'Could not roll back campaign status');
      });

    log.error({ campaignId, previousStatus }, 'Enqueue failed; campaign status rolled back');
    throw error;
  }
}

export async function startCampaign(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);

  if (isActive(campaign.status)) {
    throw AppError.conflict('This campaign is already running');
  }
  assertTransition(campaign.status, 'QUEUED');

  const template = await prisma.emailTemplate.findUnique({ where: { id: campaign.templateId } });
  if (!template) throw AppError.notFound('Template');
  if (template.status === 'INACTIVE') {
    throw AppError.badRequest('The campaign template is inactive');
  }

  const alreadyMaterialised = await prisma.campaignRecipient.count({ where: { campaignId } });
  if (alreadyMaterialised === 0) {
    const { eligible, skipped } = await materialiseRecipients(campaignId, campaign.listId);
    if (eligible === 0) {
      throw AppError.unprocessable(
        'Every recipient on this list is suppressed or unsubscribed; there is nothing to send',
      );
    }
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalRecipients: eligible + skipped, skippedCount: skipped },
    });
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'QUEUED',
      startedAt: campaign.startedAt ?? new Date(),
      pausedAt: null,
      completedAt: null,
      lastError: null,
    },
  });

  await enqueueDispatchOrRollback(campaignId, alreadyMaterialised > 0, campaign.status);

  await recordAudit({
    action: 'campaign.started',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { totalRecipients: updated.totalRecipients },
    ...context,
  });

  log.info({ campaignId, total: updated.totalRecipients }, 'Campaign queued');
  return updated;
}

export async function pauseCampaign(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);
  assertTransition(campaign.status, 'PAUSED');

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED', pausedAt: new Date() },
  });

  // In-flight jobs observe the PAUSED status and return their recipient to
  // PENDING instead of sending, so no queue surgery is required here.
  await recordAudit({
    action: 'campaign.paused',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    ...context,
  });

  return updated;
}

export async function resumeCampaign(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);

  if (campaign.status !== 'PAUSED') {
    throw AppError.conflict('Only a paused campaign can be resumed');
  }

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
  });
  if (remaining === 0) {
    return completeCampaign(campaignId);
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'QUEUED', pausedAt: null },
  });

  await enqueueDispatchOrRollback(campaignId, true, 'PAUSED');

  await recordAudit({
    action: 'campaign.resumed',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { remaining },
    ...context,
  });

  return updated;
}

export async function cancelCampaign(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);
  assertTransition(campaign.status, 'CANCELLED');

  const [updated] = await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }),
    // Un-sent work is marked SKIPPED so the recipient-level history shows
    // exactly why those addresses were never contacted.
    prisma.campaignRecipient.updateMany({
      where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
      data: { status: 'SKIPPED', errorCode: 'CAMPAIGN_CANCELLED', errorMessage: 'Campaign cancelled' },
    }),
  ]);

  await recordAudit({
    action: 'campaign.cancelled',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    ...context,
  });

  return updated;
}

/** Retries recipients whose last attempt failed. Never touches SENT rows. */
export async function retryFailedRecipients(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);

  if (isActive(campaign.status)) {
    throw AppError.conflict('Wait for the current run to finish before retrying failures');
  }
  if (campaign.status === 'CANCELLED') {
    throw AppError.conflict('A cancelled campaign cannot be retried');
  }

  const reset = await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: { in: [...RETRYABLE_RECIPIENT_STATUSES] } },
    data: { status: 'PENDING', attempts: 0, errorCode: null, errorMessage: null },
  });

  if (reset.count === 0) {
    throw AppError.badRequest('There are no failed recipients to retry');
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'QUEUED',
      completedAt: null,
      pausedAt: null,
      lastError: null,
      failedCount: { decrement: Math.min(reset.count, campaign.failedCount) },
    },
  });

  await enqueueDispatchOrRollback(campaignId, true, campaign.status);

  await recordAudit({
    action: 'campaign.retry_failed',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { retried: reset.count },
    ...context,
  });

  return { campaign: updated, retried: reset.count };
}

export async function completeCampaign(campaignId: string) {
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
}

export async function getCampaignProgress(campaignId: string): Promise<CampaignProgress> {
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    grouped.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<CampaignRecipientStatus, number>>;

  const get = (status: CampaignRecipientStatus) => counts[status] ?? 0;
  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

  // "Complete" means resolved one way or another, not just delivered.
  const resolved =
    get('SENT') +
    get('FAILED') +
    get('BOUNCED') +
    get('COMPLAINT') +
    get('UNSUBSCRIBED') +
    get('SKIPPED');

  return {
    total,
    pending: get('PENDING'),
    queued: get('QUEUED'),
    sending: get('SENDING'),
    sent: get('SENT'),
    failed: get('FAILED'),
    bounced: get('BOUNCED'),
    complaint: get('COMPLAINT'),
    unsubscribed: get('UNSUBSCRIBED'),
    skipped: get('SKIPPED'),
    percentComplete: total === 0 ? 0 : Math.round((resolved / total) * 100),
  };
}

export async function listCampaigns(params: {
  userId: string;
  status?: CampaignStatus | undefined;
  search?: string | undefined;
  /** Optional created-at window; absent means every campaign. */
  range?: DashboardRange | null | undefined;
  page: number;
  pageSize: number;
}): Promise<Paginated<Record<string, unknown>>> {
  const bounds = params.range ? rangeBounds(params.range) : null;

  const where = {
    userId: params.userId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? { name: { contains: params.search, mode: 'insensitive' as const } }
      : {}),
    // Filtered on creation, which is the date the table already shows.
    ...(bounds ? { createdAt: { gte: bounds.start, lt: bounds.end } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        list: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function getCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      list: { select: { id: true, name: true, importedCount: true } },
      template: { select: { id: true, name: true, subject: true, variables: true } },
    },
  });
  if (!campaign) throw AppError.notFound('Campaign');

  const progress = await getCampaignProgress(campaignId);
  return { ...campaign, progress };
}

export async function listCampaignRecipients(params: {
  userId: string;
  campaignId: string;
  status?: CampaignRecipientStatus | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}) {
  await requireCampaign(params.userId, params.campaignId);

  const where = {
    campaignId: params.campaignId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? { email: { contains: params.search, mode: 'insensitive' as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        recipient: { select: { name: true, company: true, storeName: true } },
      },
    }),
    prisma.campaignRecipient.count({ where }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Copy a campaign's definition into a fresh draft.
 *
 * Only the definition is copied -- list, template, subject, sender, rate. The
 * history is not: counters start at zero and the status is DRAFT, because a
 * duplicate has sent nothing. Carrying the old counts over would make the new
 * campaign claim deliveries it never made.
 *
 * The source list and template are re-validated rather than trusted, since
 * either may have been deleted, emptied or deactivated since the original ran.
 */
export async function duplicateCampaign(userId: string, campaignId: string, context: Context) {
  const source = await requireCampaign(userId, campaignId);

  const [list, template] = await Promise.all([
    prisma.recipientList.findFirst({
      where: { id: source.listId, userId },
      include: { _count: { select: { recipients: true } } },
    }),
    prisma.emailTemplate.findFirst({ where: { id: source.templateId, userId } }),
  ]);

  if (!list) throw AppError.badRequest('The recipient list for that campaign no longer exists');
  if (!template) throw AppError.badRequest('The template for that campaign no longer exists');

  // A name that is obviously a copy, and unique: "(copy)", then "(copy 2)".
  const base = `${source.name} (copy`;
  const siblings = await prisma.campaign.findMany({
    where: { userId, name: { startsWith: base } },
    select: { name: true },
  });
  let name = `${source.name} (copy)`;
  for (let n = 2; siblings.some((c) => c.name === name); n += 1) {
    name = `${source.name} (copy ${n})`;
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name,
      listId: source.listId,
      templateId: source.templateId,
      subject: source.subject,
      fromEmail: source.fromEmail,
      fromName: source.fromName,
      replyToEmail: source.replyToEmail,
      sendRatePerSecond: source.sendRatePerSecond,
      status: 'DRAFT',
      totalRecipients: 0,
    },
  });

  await recordAudit({
    action: 'campaign.duplicated',
    userId,
    entityType: 'campaign',
    entityId: campaign.id,
    metadata: { name, sourceId: source.id, sourceName: source.name },
    ...context,
  });

  return campaign;
}

export async function deleteCampaign(userId: string, campaignId: string, context: Context) {
  const campaign = await requireCampaign(userId, campaignId);
  if (isActive(campaign.status)) {
    throw AppError.conflict('Cancel the campaign before deleting it');
  }

  await prisma.campaign.delete({ where: { id: campaignId } });
  await recordAudit({
    action: 'campaign.deleted',
    userId,
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { name: campaign.name },
    ...context,
  });
}
