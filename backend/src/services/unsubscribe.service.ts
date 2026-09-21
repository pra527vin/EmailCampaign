import {
  AppError,
  createLogger,
  normalizeEmail,
  prisma,
  verifyUnsubscribeToken,
} from '@mailstrive/shared';
import { suppress } from './suppression.service.js';
import { recordAudit } from './audit.service.js';

const log = createLogger('api:unsubscribe');

export interface UnsubscribeResult {
  email: string;
  alreadyUnsubscribed: boolean;
  campaignId: string | null;
}

/**
 * Processes an opt-out.
 *
 * Deliberately does not require authentication or confirmation: RFC 8058
 * one-click unsubscribe means a mailbox provider POSTs here directly, and any
 * extra step would break it. The signed token is the authorisation.
 */
export async function processUnsubscribe(
  token: string,
  context: { ipAddress?: string | undefined; userAgent?: string | undefined; source: string },
): Promise<UnsubscribeResult> {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    throw AppError.badRequest('This unsubscribe link is invalid or has been tampered with');
  }

  const email = normalizeEmail(payload.e);

  const existing = await prisma.suppressionEntry.findUnique({
    where: { email },
    select: { id: true },
  });

  await suppress({
    email,
    reason: 'UNSUBSCRIBE',
    source: context.source,
    campaignId: payload.c ?? null,
    notes: payload.r ? `campaign_recipient:${payload.r}` : undefined,
  });

  if (payload.r) {
    // Mark the specific send row, but never overwrite a real delivery outcome.
    const updated = await prisma.campaignRecipient.updateMany({
      where: { id: payload.r, status: { notIn: ['BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED'] } },
      data: { status: 'UNSUBSCRIBED', errorCode: 'UNSUBSCRIBED', errorMessage: null },
    });

    if (updated.count > 0 && payload.c) {
      await prisma.campaign.update({
        where: { id: payload.c },
        data: { unsubscribeCount: { increment: 1 } },
      });
    }
  }

  // Any other campaign still holding this address must not send to it.
  await prisma.campaignRecipient.updateMany({
    where: { email, status: { in: ['PENDING', 'QUEUED'] } },
    data: {
      status: 'SKIPPED',
      errorCode: 'UNSUBSCRIBED',
      errorMessage: 'Recipient unsubscribed before this message was sent',
    },
  });

  await recordAudit({
    action: 'unsubscribe.processed',
    entityType: 'suppression',
    entityId: email,
    metadata: { campaignId: payload.c ?? null, source: context.source },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  log.info({ campaignId: payload.c, source: context.source }, 'Unsubscribe processed');

  return {
    email,
    alreadyUnsubscribed: existing !== null,
    campaignId: payload.c ?? null,
  };
}

/** Read-only lookup so the confirmation page can show who it is about. */
export function inspectUnsubscribeToken(token: string): { email: string; campaignId: string | null } {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) throw AppError.badRequest('This unsubscribe link is invalid or has expired');
  return { email: normalizeEmail(payload.e), campaignId: payload.c ?? null };
}
