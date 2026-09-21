import {
  createLogger,
  dispatchJobId,
  getCampaignDispatchQueue,
  prisma,
} from '@mailstrive/shared';

const log = createLogger('worker:recovery');

/**
 * Crash recovery, run once at worker start-up.
 *
 * A worker killed mid-send leaves rows stranded in SENDING and campaigns
 * stranded in SENDING with nothing in the queue. Without this, a restart would
 * silently drop those recipients. Returning them to PENDING is safe: the row
 * only reaches SENT after SES accepts the message, so anything still SENDING
 * was never confirmed delivered.
 *
 * The trade-off is explicit: a message that SES accepted in the instant before
 * the crash could be sent twice. That window is milliseconds wide, and the
 * alternative -- dropping recipients on every restart -- is worse for a system
 * whose whole job is to reach everyone exactly once.
 */
export async function recoverStalledWork(): Promise<void> {
  const stalled = await prisma.campaignRecipient.updateMany({
    where: { status: 'SENDING', campaign: { status: { in: ['QUEUED', 'SENDING'] } } },
    data: { status: 'PENDING' },
  });

  if (stalled.count > 0) {
    log.warn({ count: stalled.count }, 'Returned stalled in-flight recipients to PENDING');
  }

  // Recipients left QUEUED by a dispatcher that died before `addBulk` landed.
  const orphanedQueued = await prisma.campaignRecipient.updateMany({
    where: { status: 'QUEUED', campaign: { status: { in: ['QUEUED', 'SENDING'] } } },
    data: { status: 'PENDING' },
  });

  if (orphanedQueued.count > 0) {
    log.warn({ count: orphanedQueued.count }, 'Re-queued orphaned recipients');
  }

  const running = await prisma.campaign.findMany({
    where: { status: { in: ['QUEUED', 'SENDING'] } },
    select: { id: true, name: true },
  });

  const queue = getCampaignDispatchQueue();
  for (const campaign of running) {
    await queue.add(
      'dispatch',
      { campaignId: campaign.id, resume: true },
      { jobId: dispatchJobId(campaign.id, Date.now()) },
    );
    log.info({ campaignId: campaign.id, name: campaign.name }, 'Re-dispatched campaign after restart');
  }
}
