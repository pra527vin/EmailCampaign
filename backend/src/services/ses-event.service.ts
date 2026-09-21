import {
  createLogger,
  prisma,
  type EmailEventType,
  type CampaignRecipientStatus,
} from '@mailstrive/shared';
import { suppress } from './suppression.service.js';

const log = createLogger('api:ses-events');

/**
 * Ingests SES notifications delivered over SNS.
 *
 * Bounces and complaints are the two events with real consequences: a hard
 * bounce or any complaint permanently suppresses the address, because
 * continuing to mail it is exactly what gets an SES account throttled or shut
 * down.
 */

interface SesNotification {
  eventType?: string;
  notificationType?: string;
  mail?: {
    messageId?: string;
    timestamp?: string;
    destination?: string[];
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    timestamp?: string;
    bouncedRecipients?: Array<{
      emailAddress?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
  };
  complaint?: {
    timestamp?: string;
    complaintFeedbackType?: string;
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
  delivery?: { timestamp?: string; recipients?: string[] };
  reject?: { reason?: string };
  open?: { timestamp?: string };
  click?: { timestamp?: string; link?: string };
  deliveryDelay?: { timestamp?: string; delayType?: string };
}

const EVENT_TYPE_MAP: Record<string, EmailEventType> = {
  send: 'SEND',
  delivery: 'DELIVERY',
  deliverydelay: 'DELIVERY_DELAY',
  bounce: 'BOUNCE',
  complaint: 'COMPLAINT',
  reject: 'REJECT',
  open: 'OPEN',
  click: 'CLICK',
  renderingfailure: 'RENDERING_FAILURE',
  subscription: 'SUBSCRIPTION',
};

/** Statuses that a late-arriving event must not overwrite. */
const TERMINAL_NEGATIVE: CampaignRecipientStatus[] = ['BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED'];

export async function handleSesNotification(payload: unknown): Promise<{ handled: boolean; type: string }> {
  const notification = payload as SesNotification;
  const rawType = (notification.eventType ?? notification.notificationType ?? '').toLowerCase().replace(/[\s_-]/g, '');
  const type = EVENT_TYPE_MAP[rawType];

  if (!type) {
    log.warn({ rawType }, 'Ignoring unrecognised SES event type');
    return { handled: false, type: rawType };
  }

  const messageId = notification.mail?.messageId;
  if (!messageId) {
    log.warn({ type }, 'SES event has no mail.messageId; cannot correlate');
    return { handled: false, type };
  }

  const campaignRecipient = await prisma.campaignRecipient.findUnique({
    where: { messageId },
    select: { id: true, campaignId: true, email: true, status: true },
  });

  const occurredAt = parseTimestamp(
    notification.bounce?.timestamp ??
      notification.complaint?.timestamp ??
      notification.delivery?.timestamp ??
      notification.mail?.timestamp,
  );

  await prisma.emailEvent.create({
    data: {
      campaignId: campaignRecipient?.campaignId ?? null,
      campaignRecipientId: campaignRecipient?.id ?? null,
      messageId,
      email: campaignRecipient?.email ?? notification.mail?.destination?.[0] ?? null,
      type,
      payload: trimPayload(notification) as never,
      occurredAt,
    },
  });

  if (!campaignRecipient) {
    log.info({ messageId, type }, 'SES event stored without a matching campaign recipient');
    return { handled: true, type };
  }

  switch (type) {
    case 'BOUNCE':
      await applyBounce(campaignRecipient, notification);
      break;
    case 'COMPLAINT':
      await applyComplaint(campaignRecipient, notification);
      break;
    case 'REJECT':
      await applyReject(campaignRecipient, notification);
      break;
    default:
      // DELIVERY / OPEN / CLICK are recorded for reporting but do not change
      // the recipient's status: SENT already reflects a successful handoff.
      break;
  }

  return { handled: true, type };
}

type MinimalRecipient = { id: string; campaignId: string; email: string; status: CampaignRecipientStatus };

async function applyBounce(recipient: MinimalRecipient, notification: SesNotification) {
  const bounceType = notification.bounce?.bounceType ?? 'Undetermined';
  const subType = notification.bounce?.bounceSubType ?? '';
  const diagnostic = notification.bounce?.bouncedRecipients?.[0]?.diagnosticCode ?? null;
  const isHard = bounceType === 'Permanent';

  if (TERMINAL_NEGATIVE.includes(recipient.status)) return;

  await prisma.$transaction([
    prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'BOUNCED',
        errorCode: `BOUNCE_${bounceType}${subType ? `_${subType}` : ''}`,
        errorMessage: diagnostic?.slice(0, 500) ?? `${bounceType} bounce`,
      },
    }),
    prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        bounceCount: { increment: 1 },
        // The send itself succeeded earlier and was counted; a bounce undoes it.
        ...(recipient.status === 'SENT' ? { sentCount: { decrement: 1 } } : {}),
      },
    }),
  ]);

  // Transient bounces (mailbox full, greylisting) must not suppress an address.
  if (isHard) {
    await suppress({
      email: recipient.email,
      reason: 'BOUNCE',
      source: 'ses-bounce',
      campaignId: recipient.campaignId,
      notes: `${bounceType}/${subType}`,
    });
  }

  log.info({ email: recipient.email, bounceType, subType, suppressed: isHard }, 'Bounce processed');
}

async function applyComplaint(recipient: MinimalRecipient, notification: SesNotification) {
  if (recipient.status === 'COMPLAINT') return;

  await prisma.$transaction([
    prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'COMPLAINT',
        errorCode: 'COMPLAINT',
        errorMessage: notification.complaint?.complaintFeedbackType ?? 'Recipient marked as spam',
      },
    }),
    prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        complaintCount: { increment: 1 },
        ...(recipient.status === 'SENT' ? { sentCount: { decrement: 1 } } : {}),
      },
    }),
  ]);

  // A complaint is always permanent: the recipient has explicitly said this
  // mail is unwanted.
  await suppress({
    email: recipient.email,
    reason: 'COMPLAINT',
    source: 'ses-complaint',
    campaignId: recipient.campaignId,
    notes: notification.complaint?.complaintFeedbackType,
  });

  log.warn({ email: recipient.email }, 'Complaint processed and address suppressed');
}

async function applyReject(recipient: MinimalRecipient, notification: SesNotification) {
  if (TERMINAL_NEGATIVE.includes(recipient.status)) return;

  await prisma.$transaction([
    prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'FAILED',
        errorCode: 'SES_REJECT',
        errorMessage: notification.reject?.reason ?? 'Rejected by SES',
      },
    }),
    prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        failedCount: { increment: 1 },
        ...(recipient.status === 'SENT' ? { sentCount: { decrement: 1 } } : {}),
      },
    }),
  ]);
}

function parseTimestamp(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Keeps only the diagnostic fields; never stores rendered message content. */
function trimPayload(notification: SesNotification): Record<string, unknown> {
  return {
    mail: {
      messageId: notification.mail?.messageId,
      timestamp: notification.mail?.timestamp,
      tags: notification.mail?.tags,
    },
    ...(notification.bounce
      ? {
          bounce: {
            bounceType: notification.bounce.bounceType,
            bounceSubType: notification.bounce.bounceSubType,
            diagnosticCode: notification.bounce.bouncedRecipients?.[0]?.diagnosticCode,
          },
        }
      : {}),
    ...(notification.complaint
      ? { complaint: { feedbackType: notification.complaint.complaintFeedbackType } }
      : {}),
    ...(notification.reject ? { reject: notification.reject } : {}),
    ...(notification.click ? { click: { link: notification.click.link } } : {}),
    ...(notification.deliveryDelay
      ? { deliveryDelay: { delayType: notification.deliveryDelay.delayType } }
      : {}),
  };
}

export async function listCampaignEvents(params: {
  userId: string;
  campaignId: string;
  page: number;
  pageSize: number;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.campaignId, userId: params.userId },
    select: { id: true },
  });
  if (!campaign) return { items: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 1 };

  const where = { campaignId: params.campaignId };
  const [items, total] = await Promise.all([
    prisma.emailEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.emailEvent.count({ where }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
