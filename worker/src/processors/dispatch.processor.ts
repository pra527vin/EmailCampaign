import type { Job } from 'bullmq';
import {
  createLogger,
  getEmailSendQueue,
  loadEnv,
  prisma,
  sendJobId,
  type CampaignDispatchJob,
} from '@mailstrive/shared';

const log = createLogger('worker:dispatch');

/**
 * Fans a campaign out into one queue job per recipient.
 *
 * Recipients are claimed in non-overlapping chunks of `batchSize` (the
 * campaign's own override, or `DISPATCH_BATCH_SIZE` by default): each chunk is
 * selected in `id` order, flipped from PENDING to QUEUED, and only then
 * enqueued. That flip is what makes the batches non-overlapping -- a
 * recipient moved out of PENDING can never be selected by the next chunk, so
 * the same recipient can never be queued, and therefore never sent, twice.
 *
 * Paged with a keyset cursor rather than OFFSET so cost stays flat across a
 * million-row list, and re-checks the campaign status between pages so a pause
 * or cancel takes effect within one batch instead of after the whole list has
 * been enqueued.
 */
export async function processDispatch(job: Job<CampaignDispatchJob>): Promise<{
  enqueued: number;
  stopped: boolean;
}> {
  const env = loadEnv();
  const { campaignId, resume } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, name: true, batchSize: true },
  });

  if (!campaign) {
    log.warn({ campaignId }, 'Dispatch job for a campaign that no longer exists');
    return { enqueued: 0, stopped: true };
  }

  if (campaign.status !== 'QUEUED' && campaign.status !== 'SENDING') {
    log.info({ campaignId, status: campaign.status }, 'Dispatch skipped - campaign is not running');
    return { enqueued: 0, stopped: true };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'SENDING' },
  });

  const queue = getEmailSendQueue();
  const batchSize = campaign.batchSize ?? env.DISPATCH_BATCH_SIZE;

  let cursor: string | undefined;
  let enqueued = 0;
  let stopped = false;

  for (;;) {
    const batch = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, attempts: true },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]?.id;

    // Flip to QUEUED first. If the process dies between here and the enqueue,
    // the rows are recovered by `recoverStalledCampaigns` rather than being
    // silently skipped.
    await prisma.campaignRecipient.updateMany({
      where: { id: { in: batch.map((row) => row.id) }, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });

    await queue.addBulk(
      batch.map((row) => ({
        name: 'send',
        data: { campaignId, campaignRecipientId: row.id },
        opts: {
          // Including the attempt count keeps the id unique across retries of
          // the same recipient, which a deterministic id alone would not.
          jobId: sendJobId(row.id, row.attempts),
        },
      })),
    );

    enqueued += batch.length;
    await job.updateProgress({ enqueued });

    const current = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (current?.status !== 'SENDING') {
      log.info({ campaignId, status: current?.status }, 'Dispatch stopping - campaign no longer sending');
      stopped = true;
      break;
    }

    if (batch.length < batchSize) break;
  }

  log.info({ campaignId, enqueued, resume: Boolean(resume), stopped }, 'Dispatch complete');

  // A resumed run can find nothing left to do; settle the campaign here.
  if (!stopped && enqueued === 0) {
    await settleIfFinished(campaignId);
  }

  return { enqueued, stopped };
}

/** Marks a campaign COMPLETED once no recipient is still outstanding. */
export async function settleIfFinished(campaignId: string): Promise<boolean> {
  const outstanding = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
  });

  if (outstanding > 0) return false;

  const result = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: ['QUEUED', 'SENDING'] } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  if (result.count > 0) {
    log.info({ campaignId }, 'Campaign completed');
  }
  return result.count > 0;
}
