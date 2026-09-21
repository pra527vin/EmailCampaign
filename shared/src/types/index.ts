/** Envelope every API list endpoint returns. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportSummary {
  totalRows: number;
  validRecipients: number;
  invalidRecipients: number;
  duplicateRecipients: number;
  suppressedRecipients: number;
  importedRecipients: number;
  columns: string[];
  errors: Array<{ row: number; email: string | null; reason: string }>;
}

export interface CampaignProgress {
  total: number;
  pending: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  bounced: number;
  complaint: number;
  unsubscribed: number;
  skipped: number;
  percentComplete: number;
}

/**
 * The window the dashboard is reporting on.
 *
 * Both ends are inclusive calendar days in UTC, which is the timezone
 * `date_trunc` buckets in, so the bars a user sees line up with the range they
 * picked instead of drifting by one at the edges.
 */
export interface DashboardRange {
  /** Inclusive start, YYYY-MM-DD. */
  from: string;
  /** Inclusive end, YYYY-MM-DD. */
  to: string;
  /** Number of days covered, inclusive of both ends. */
  days: number;
  /** Set when the range came from a preset rather than two chosen dates. */
  preset: '7d' | '30d' | '90d' | null;
}

export interface DashboardStats {
  range: DashboardRange;
  totals: {
    /** Inventory. Not scoped to the range -- see `windowed` for what is. */
    campaigns: number;
    recipientLists: number;
    recipients: number;
    templates: number;
    emails: number;
  };
  /** Message outcomes for activity that falls inside the range. */
  windowed: {
    sent: number;
    pending: number;
    failed: number;
    bounced: number;
    complaints: number;
    unsubscribed: number;
  };
  activeCampaign: {
    id: string;
    name: string;
    status: string;
    progress: CampaignProgress;
  } | null;
  /** Campaigns created inside the range, newest first. */
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
  }>;
  activity: Array<{ date: string; sent: number; failed: number; bounced: number }>;
}
