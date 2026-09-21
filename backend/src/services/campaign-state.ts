import type { CampaignStatus } from '@mailstrive/shared';

/**
 * Campaign lifecycle, expressed as an explicit transition table.
 *
 * Kept as pure data so the rules are testable without a database and so every
 * caller (HTTP routes, worker, retry path) agrees on what is legal. Anything
 * not listed here is rejected.
 */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT: ['QUEUED', 'CANCELLED'],
  QUEUED: ['SENDING', 'PAUSED', 'CANCELLED', 'FAILED'],
  SENDING: ['PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED'],
  PAUSED: ['QUEUED', 'SENDING', 'CANCELLED'],
  COMPLETED: ['QUEUED'], // Re-opened only by an explicit "retry failed recipients".
  CANCELLED: [],
  FAILED: ['QUEUED', 'CANCELLED'],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** Statuses where the campaign still owns jobs in the queue. */
export const ACTIVE_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['QUEUED', 'SENDING'];

export function isActive(status: CampaignStatus): boolean {
  return ACTIVE_CAMPAIGN_STATUSES.includes(status);
}

export function isTerminal(status: CampaignStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/**
 * Recipient statuses eligible for a fresh send.
 *
 * SENT is deliberately absent -- that is the guarantee that resuming a campaign
 * never re-mails somebody who already received it. BOUNCED, COMPLAINT and
 * UNSUBSCRIBED are absent because re-sending to them damages sender reputation
 * and, for UNSUBSCRIBED, is unlawful in most jurisdictions.
 */
export const RESUMABLE_RECIPIENT_STATUSES = ['PENDING', 'QUEUED'] as const;

/** Additionally eligible when the user explicitly asks to retry failures. */
export const RETRYABLE_RECIPIENT_STATUSES = ['FAILED'] as const;
