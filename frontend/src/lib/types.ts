export type CampaignStatus =
  | 'DRAFT' | 'QUEUED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export type RecipientStatus =
  | 'PENDING' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'BOUNCED'
  | 'COMPLAINT' | 'UNSUBSCRIBED' | 'SKIPPED';

export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface RecipientList {
  id: string;
  name: string;
  description: string | null;
  sourceFileName: string;
  sourceFileSize: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  columns: string[];
  recipientCount: number;
  campaignCount: number;
  createdAt: string;
  errorSample?: Array<{ row: number; email: string | null; reason: string }> | null;
}

export interface Recipient {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  storeName: string | null;
  storeUrl: string | null;
  customFields: Record<string, string>;
  rowNumber: number;
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

export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  htmlContent: string;
  textContent: string;
  status: TemplateStatus;
  variables: string[];
  campaignCount?: number;
  createdAt: string;
  updatedAt: string;
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

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  listId: string;
  templateId: string;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  /** Recipients per dispatch chunk. Null uses the platform default. */
  batchSize: number | null;
  /** Restricts the campaign to these list rows (1-based, inclusive). Both null means the whole list. */
  recipientRangeStart: number | null;
  recipientRangeEnd: number | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
  skippedCount: number;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  list?: { id: string; name: string; importedCount?: number };
  template?: { id: string; name: string; subject: string; variables: string[] };
  progress?: CampaignProgress;
}

export interface CampaignRecipient {
  id: string;
  email: string;
  status: RecipientStatus;
  attempts: number;
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  lastAttemptAt: string | null;
  recipient?: { name: string | null; company: string | null; storeName: string | null };
}

export interface EmailEvent {
  id: string;
  type: string;
  email: string | null;
  messageId: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
}

/** The window the dashboard is reporting on. Inclusive UTC calendar days. */
export interface DashboardRange {
  from: string;
  to: string;
  days: number;
  preset: '7d' | '30d' | '90d' | null;
}

export interface DashboardStats {
  range: DashboardRange;
  totals: {
    /** Inventory, deliberately not scoped to the range. */
    campaigns: number;
    recipientLists: number;
    recipients: number;
    templates: number;
    emails: number;
  };
  /** Outcomes for activity inside the range. */
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
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: CampaignStatus;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
  }>;
  activity: Array<{ date: string; sent: number; failed: number; bounced: number }>;
}

export interface EmailHtmlWarning {
  code: string;
  level: 'error' | 'warning';
  message: string;
}

export interface EmailPreview {
  subject: string;
  from: string;
  to: string;
  replyTo: string | null;
  html: string;
  text: string;
  unsubscribeUrl: string;
  missingVariables: string[];
  rawHeaders: string;
  sampleSource: 'recipient' | 'sample';
  /** Deliverability problems detected in the template source. */
  warnings: EmailHtmlWarning[];
}

export interface SenderSettings {
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  region: string;
  configurationSet: string | null;
  configuredSendRate: number;
  configuredDailyQuota: number;
  dryRun: boolean;
  /** Which wire protocol reaches SES: the signed API, or SMTP with SES credentials. */
  transport: 'api' | 'smtp';
  smtpEndpoint: string | null;
  credentialsSource: string;
  webhookUrl: string;
  reachable: boolean;
  reason?: string;
  senderVerified?: boolean;
  account?: {
    sendingEnabled: boolean;
    productionAccessEnabled: boolean;
    max24HourSend: number | null;
    maxSendRate: number | null;
    sentLast24Hours: number | null;
    enforcementStatus: string | null;
  };
  identity?: {
    identity: string;
    verified: boolean;
    identityType: string | null;
    dkimStatus: string | null;
    dkimSigningEnabled: boolean;
  } | null;
}

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: 'UNSUBSCRIBE' | 'BOUNCE' | 'COMPLAINT' | 'MANUAL';
  source: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DeliverabilityFinding {
  id: string;
  level: 'ok' | 'warning' | 'error' | 'info';
  title: string;
  detail: string;
  /** The DNS record to publish, when one is missing or wrong. */
  record?: { name: string; type: 'TXT' | 'CNAME'; value: string };
}

export interface DomainAuthenticationReport {
  domain: string;
  checkedAt: string;
  findings: DeliverabilityFinding[];
  passes: boolean;
}
