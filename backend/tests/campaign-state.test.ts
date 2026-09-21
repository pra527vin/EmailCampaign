import { describe, expect, it } from 'vitest';
import type { CampaignStatus } from '@mailstrive/shared';
import {
  CAMPAIGN_TRANSITIONS,
  canTransition,
  isActive,
  isTerminal,
  RESUMABLE_RECIPIENT_STATUSES,
} from '../src/services/campaign-state.js';

const ALL_STATUSES: CampaignStatus[] = [
  'DRAFT', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED',
];

describe('campaign state machine', () => {
  it('allows the normal lifecycle', () => {
    expect(canTransition('DRAFT', 'QUEUED')).toBe(true);
    expect(canTransition('QUEUED', 'SENDING')).toBe(true);
    expect(canTransition('SENDING', 'COMPLETED')).toBe(true);
  });

  it('allows pause and resume while sending', () => {
    expect(canTransition('SENDING', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'SENDING')).toBe(true);
    expect(canTransition('PAUSED', 'QUEUED')).toBe(true);
  });

  it('treats CANCELLED as final', () => {
    expect(CAMPAIGN_TRANSITIONS.CANCELLED).toHaveLength(0);
    for (const status of ALL_STATUSES) {
      expect(canTransition('CANCELLED', status)).toBe(false);
    }
  });

  it('refuses to send a campaign straight from DRAFT', () => {
    expect(canTransition('DRAFT', 'SENDING')).toBe(false);
  });

  it('refuses to reopen a completed campaign except to re-queue a retry', () => {
    expect(canTransition('COMPLETED', 'SENDING')).toBe(false);
    expect(canTransition('COMPLETED', 'PAUSED')).toBe(false);
    expect(canTransition('COMPLETED', 'QUEUED')).toBe(true);
  });

  it('names only QUEUED and SENDING as active', () => {
    expect(isActive('QUEUED')).toBe(true);
    expect(isActive('SENDING')).toBe(true);
    expect(isActive('PAUSED')).toBe(false);
    expect(isActive('DRAFT')).toBe(false);
  });

  it('names COMPLETED and CANCELLED as terminal', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(false);
  });

  it('declares a transition table entry for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(CAMPAIGN_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('resume eligibility', () => {
  it('never re-sends to an address that was already delivered', () => {
    // This is the guarantee behind "resume does not restart completed recipients".
    expect(RESUMABLE_RECIPIENT_STATUSES).not.toContain('SENT');
  });

  it('never re-sends to bounced, complained or unsubscribed addresses', () => {
    expect(RESUMABLE_RECIPIENT_STATUSES).not.toContain('BOUNCED');
    expect(RESUMABLE_RECIPIENT_STATUSES).not.toContain('COMPLAINT');
    expect(RESUMABLE_RECIPIENT_STATUSES).not.toContain('UNSUBSCRIBED');
  });

  it('resumes outstanding work only', () => {
    expect([...RESUMABLE_RECIPIENT_STATUSES]).toEqual(['PENDING', 'QUEUED']);
  });
});
