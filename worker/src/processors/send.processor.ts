import { UnrecoverableError, type Job } from 'bullmq';
import {
  composeEmail,
  createLogger,
  loadEnv,
  prisma,
  sendRawEmail,
  SesSendError,
  type EmailSendJob,
} from '@mailstrive/shared';
import { settleIfFinished } from './dispatch.processor.js';

const log = createLogger('worker:send');

/**
 * Delivers exactly one message to exactly one recipient.
 *
 * The guarantees this function is responsible for:
 *
 *  - One message per recipient. The destination is always a single address;
 *    CC and BCC are never populated for campaign delivery.
 *  - No double send. An atomic conditional UPDATE claims the row by moving it
 *    out of PENDING/QUEUED into SENDING. Two workers racing on the same job
 *    means exactly one sees `count === 1`; the loser exits without sending.
 *  - No send to a suppressed address. Checked here, at the last possible
 *    moment, because a recipient can unsubscribe while the job is in the queue.
 *  - Pause and cancel take effect on in-flight work, by returning the row to
 *    PENDING instead of delivering.
 */
export async function processSend(job: Job<EmailSendJob>): Promise<{ status: string }> {
  const env = loadEnv();
  const { campaignId, campaignRecipientId } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign) {
    // Nothing a retry can fix.
    throw new UnrecoverableError(`Campaign ${campaignId} no longer exists`);
  }

  if (campaign.status === 'PAUSED') {
    await releaseToPending(campaignRecipientId);
    return { status: 'paused' };
  }
  if (campaign.status === 'CANCELLED') {
    await markSkipped(campaignRecipientId, 'CAMPAIGN_CANCELLED', 'Campaign was cancelled');
    return { status: 'cancelled' };
  }
  if (campaign.status !== 'SENDING' && campaign.status !== 'QUEUED') {
    await releaseToPending(campaignRecipientId);
    return { status: `campaign_${campaign.status.toLowerCase()}` };
  }

  // --- Claim the row ------------------------------------------------------
  // This is the idempotency guard. A row already SENT is not in the `in` list,
  // so a duplicate job can never produce a second message.
  const claimed = await prisma.campaignRecipient.updateMany({
    where: { id: campaignRecipientId, status: { in: ['PENDING', 'QUEUED'] } },
    data: { status: 'SENDING', lastAttemptAt: new Date(), attempts: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const current = await prisma.campaignRecipient.findUnique({
      where: { id: campaignRecipientId },
      select: { status: true },
    });
    log.debug(
      { campaignRecipientId, status: current?.status },
      'Send job skipped - recipient is not claimable',
    );
    return { status: `skipped_${current?.status?.toLowerCase() ?? 'missing'}` };
  }

  const campaignRecipient = await prisma.campaignRecipient.findUnique({
    where: { id: campaignRecipientId },
    include: { recipient: true },
  });

  if (!campaignRecipient) {
    throw new UnrecoverableError(`Campaign recipient ${campaignRecipientId} disappeared mid-send`);
  }

  // --- Final suppression check -------------------------------------------
  const suppressed = await prisma.suppressionEntry.findUnique({
    where: { email: campaignRecipient.email },
    select: { reason: true },
  });

  if (suppressed) {
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: campaignRecipientId },
        data: {
          status: suppressed.reason === 'UNSUBSCRIBE' ? 'UNSUBSCRIBED' : 'SKIPPED',
          errorCode: `SUPPRESSED_${suppressed.reason}`,
          errorMessage: 'Address is on the suppression list',
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { skippedCount: { increment: 1 } },
      }),
    ]);
    await settleIfFinished(campaignId);
    return { status: 'suppressed' };
  }

  // --- Compose and deliver ------------------------------------------------
  const composed = composeEmail({
    subject: campaign.subject,
    htmlContent: campaign.template.htmlContent,
    textContent: campaign.template.textContent,
    recipient: {
      email: campaignRecipient.recipient.email,
      name: campaignRecipient.recipient.name,
      firstName: campaignRecipient.recipient.firstName,
      lastName: campaignRecipient.recipient.lastName,
      company: campaignRecipient.recipient.company,
      storeName: campaignRecipient.recipient.storeName,
      storeUrl: campaignRecipient.recipient.storeUrl,
      customFields: campaignRecipient.recipient.customFields as Record<string, unknown>,
    },
    campaignId,
    campaignRecipientId,
  });

  try {
    const result = await sendRawEmail({
      from: { email: campaign.fromEmail, name: campaign.fromName ?? undefined },
      to: {
        email: campaignRecipient.recipient.email,
        name: campaignRecipient.recipient.name ?? undefined,
      },
      replyTo: campaign.replyToEmail ?? undefined,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      listUnsubscribeUrl: composed.oneClickUrl,
      listUnsubscribeMailto: campaign.replyToEmail ?? undefined,
      configurationSetName: env.SES_CONFIGURATION_SET,
      // Tags come back on SNS events, which is how a delivery report is
      // attributed to a campaign without a database lookup.
      tags: { campaign_id: campaignId.replace(/-/g, ''), source: 'mailstrive' },
      extraHeaders: { 'X-Campaign-ID': campaignId },
    });

    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: campaignRecipientId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          messageId: result.messageId,
          errorCode: null,
          errorMessage: null,
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      }),
      prisma.emailEvent.create({
        data: {
          campaignId,
          campaignRecipientId,
          messageId: result.messageId,
          email: campaignRecipient.email,
          type: 'SEND',
          payload: { dryRun: result.dryRun, headerMessageId: result.headerMessageId } as never,
          occurredAt: new Date(),
        },
      }),
    ]);

    log.info(
      { campaignId, campaignRecipientId, messageId: result.messageId, dryRun: result.dryRun },
      'Message sent',
    );

    await settleIfFinished(campaignId);
    return { status: 'sent' };
  } catch (error) {
    return handleSendFailure(job, error, campaignId, campaignRecipientId);
  }
}

async function handleSendFailure(
  job: Job<EmailSendJob>,
  error: unknown,
  campaignId: string,
  campaignRecipientId: string,
): Promise<never> {
  const env = loadEnv();
  const sesError = error instanceof SesSendError ? error : null;
  const code = sesError?.code ?? (error as Error)?.name ?? 'UNKNOWN_ERROR';
  const message = (error as Error)?.message ?? 'Unknown error';

  const attemptsUsed = job.attemptsMade + 1;
  const isLastAttempt = attemptsUsed >= (job.opts.attempts ?? env.SEND_MAX_ATTEMPTS);
  const permanent = sesError ? !sesError.retryable : false;

  if (permanent || isLastAttempt) {
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: campaignRecipientId },
        data: {
          status: 'FAILED',
          errorCode: code,
          errorMessage: message.slice(0, 500),
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      }),
      prisma.emailEvent.create({
        data: {
          campaignId,
          campaignRecipientId,
          email: null,
          type: 'FAILED',
          payload: { code, permanent } as never,
          occurredAt: new Date(),
        },
      }),
    ]);

    log.error({ campaignId, campaignRecipientId, code, permanent }, 'Send permanently failed');
    await settleIfFinished(campaignId);

    // A permanent SES rejection must not burn the remaining BullMQ attempts.
    if (permanent) throw new UnrecoverableError(`${code}: ${message}`);
    throw error;
  }

  // Retryable: hand the row back so the retry can re-claim it.
  await prisma.campaignRecipient.update({
    where: { id: campaignRecipientId },
    data: { status: 'QUEUED', errorCode: code, errorMessage: message.slice(0, 500) },
  });

  log.warn(
    { campaignId, campaignRecipientId, code, attempt: attemptsUsed },
    'Send failed; will retry',
  );
  throw error;
}

async function releaseToPending(campaignRecipientId: string): Promise<void> {
  await prisma.campaignRecipient.updateMany({
    where: { id: campaignRecipientId, status: { in: ['QUEUED', 'SENDING'] } },
    data: { status: 'PENDING' },
  });
}

async function markSkipped(
  campaignRecipientId: string,
  code: string,
  reason: string,
): Promise<void> {
  await prisma.campaignRecipient.updateMany({
    where: { id: campaignRecipientId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
    data: { status: 'SKIPPED', errorCode: code, errorMessage: reason },
  });
}
