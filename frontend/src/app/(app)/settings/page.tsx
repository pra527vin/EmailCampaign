'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  formatDate,
  formatNumber,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Spinner,
} from '@/components/ui';
import { DeliverabilityPanel } from '@/components/deliverability-panel';
import type { Paginated, SenderSettings, SuppressionEntry } from '@/lib/types';

/** Why an address is suppressed, coloured by how much attention it deserves. */
const SUPPRESSION_TONES: Record<SuppressionEntry['reason'], 'purple' | 'warning' | 'danger' | 'neutral'> = {
  UNSUBSCRIBE: 'purple',
  BOUNCE: 'warning',
  COMPLAINT: 'danger',
  MANUAL: 'neutral',
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Sender configuration, suppression list and your account." />
      <div className="space-y-5 sm:space-y-6">
        <SenderPanel />
        <DeliverabilityPanel />
        <QueuePanel />
        <SuppressionPanel />
        <PasswordPanel />
      </div>
    </>
  );
}

function SenderPanel() {
  const [settings, setSettings] = useState<SenderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SenderSettings>('/settings/sender')
      .then(setSettings)
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!settings) return <Card title="Amazon SES"><Spinner /></Card>;

  const quotaUsed =
    settings.account?.max24HourSend && settings.account.sentLast24Hours !== null
      ? Math.round((settings.account.sentLast24Hours / settings.account.max24HourSend) * 100)
      : null;

  return (
    <Card
      title="Amazon SES"
      description="Read-only. These values come from environment configuration and the live SES account."
    >
      {settings.dryRun && (
        <div className="mb-4">
          <Alert tone="warning" title="Dry-run mode is enabled">
            Campaigns will be composed and marked as sent without contacting Amazon SES. Set
            <code className="mx-1 font-mono text-xs">SES_SANDBOX_DRY_RUN=false</code> to deliver for real.
          </Alert>
        </div>
      )}

      {!settings.reachable && !settings.dryRun && (
        <div className="mb-4">
          <Alert tone="error" title="Cannot reach Amazon SES">
            {settings.reason ?? 'Check AWS credentials and region.'}
          </Alert>
        </div>
      )}

      {settings.transport === 'smtp' && settings.reachable && (
        <div className="mb-4">
          <Alert tone="info" title="Sending over SMTP">
            Connected to {settings.smtpEndpoint} with SES SMTP credentials. Account quota, sending
            status and identity verification are only available over the SES API, so they are not
            shown below.
          </Alert>
        </div>
      )}

      {settings.transport === 'api' && settings.reachable && settings.senderVerified === false && (
        <div className="mb-4">
          <Alert tone="error" title="Sender identity is not verified">
            SES will reject every message from {settings.fromEmail}. Verify the address or its domain
            in the SES console for region {settings.region}.
          </Alert>
        </div>
      )}

      <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
        <dl className="space-y-2.5 text-sm">
          <Row label="From address">{settings.fromEmail}</Row>
          <Row label="From name">{settings.fromName ?? '—'}</Row>
          <Row label="Reply-to">{settings.replyToEmail ?? '—'}</Row>
          <Row label="Region">{settings.region}</Row>
          <Row label="Transport">
            <Badge tone={settings.transport === 'smtp' ? 'info' : 'brand'}>
              {settings.transport === 'smtp' ? 'SMTP' : 'SES API'}
            </Badge>
          </Row>
          {settings.smtpEndpoint && <Row label="SMTP endpoint">{settings.smtpEndpoint}</Row>}
          <Row label="Configuration set">{settings.configurationSet ?? 'not set'}</Row>
          <Row label="Credentials">{settings.credentialsSource}</Row>
        </dl>

        <dl className="space-y-2.5 text-sm">
          <Row label="Configured send rate">{settings.configuredSendRate}/second</Row>
          <Row label="Configured daily quota">{formatNumber(settings.configuredDailyQuota)}</Row>
          {/* Everything below is read from the SES API, which SMTP credentials
              cannot call. Showing a column of em-dashes would imply the values
              were fetched and came back empty. */}
          {settings.transport === 'api' && (
            <>
              <Row label="SES max send rate">{settings.account?.maxSendRate ?? '—'}/second</Row>
              <Row label="24-hour quota">{formatNumber(settings.account?.max24HourSend ?? 0)}</Row>
              <Row label="Sent in last 24h">
                {formatNumber(settings.account?.sentLast24Hours ?? 0)}
                {quotaUsed !== null && (
                  <span className="ml-1 text-xs text-slate-500">({quotaUsed}%)</span>
                )}
              </Row>
              <Row label="Production access">
                {settings.account
                  ? settings.account.productionAccessEnabled
                    ? 'Yes'
                    : 'Sandbox only'
                  : '—'}
              </Row>
              <Row label="DKIM">
                {settings.identity
                  ? `${settings.identity.dkimStatus ?? 'unknown'}${settings.identity.dkimSigningEnabled ? ' (signing on)' : ''}`
                  : '—'}
              </Row>
            </>
          )}
        </dl>
      </div>

      <div className="mt-5 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          SNS webhook endpoint
        </p>
        <p className="mt-1 break-all font-mono text-xs text-slate-700">{settings.webhookUrl}</p>
        <p className="mt-1.5 text-xs text-slate-500">
          Subscribe an SNS topic to this URL and attach it to your SES configuration set to receive
          bounce, complaint and delivery events. Signatures are verified before anything is recorded.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Domain authentication
        </p>
        <p className="mt-1.5 text-xs text-slate-600">
          SPF, DKIM and DMARC are DNS records, not application settings. Publish the DKIM CNAMEs SES
          generates for your domain, include <code className="font-mono">amazonses.com</code> in your
          SPF record, and publish a DMARC policy. The application emits standards-compliant headers
          and sends only from a verified identity; alignment is configured at the DNS level.
        </p>
      </div>
    </Card>
  );
}

function QueuePanel() {
  const [state, setState] = useState<{
    reachable: boolean;
    reason?: string;
    counts?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .get<{ reachable: boolean; reason?: string; counts?: Record<string, number> }>('/settings/queue')
        .then(setState)
        .catch(() => setState({ reachable: false, reason: 'Queue status unavailable' }));

    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card title="Send queue" description="Live depth of the email worker queue.">
      {!state ? (
        <Spinner />
      ) : !state.reachable ? (
        <Alert tone="error">{state.reason ?? 'Cannot reach Redis.'}</Alert>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          {Object.entries(state.counts ?? {}).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs capitalize text-slate-500">{key}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function SuppressionPanel() {
  const [data, setData] = useState<Paginated<SuppressionEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState<SuppressionEntry['reason']>('MANUAL');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '10' });
    if (applied) query.set('search', applied);
    try {
      setData(await api.get<Paginated<SuppressionEntry>>(`/settings/suppressions?${query}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [page, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/settings/suppressions', { email: email.trim().toLowerCase(), reason });
      setEmail('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(entry: SuppressionEntry) {
    if (
      !confirm(
        `Remove ${entry.email} from the suppression list? Only do this if you have a record of renewed consent.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/settings/suppressions/${encodeURIComponent(entry.email)}`);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Card
      title="Suppression list"
      description="Addresses that will never be mailed. Unsubscribes, complaints and hard bounces land here automatically."
    >
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleAdd} className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label="Add an address" htmlFor="suppress-email" className="sm:min-w-[16rem] sm:flex-1">
          <Input
            id="suppress-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            required
          />
        </Field>
        <Field label="Reason" htmlFor="suppress-reason" className="sm:w-44">
          <Select
            id="suppress-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value as SuppressionEntry['reason'])}
          >
            <option value="MANUAL">Manual</option>
            <option value="UNSUBSCRIBE">Unsubscribe</option>
            <option value="BOUNCE">Bounce</option>
            <option value="COMPLAINT">Complaint</option>
          </Select>
        </Field>
        <Button type="submit" loading={busy}>
          Suppress
        </Button>
      </form>

      <div className="mb-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          onSubmit={() => {
            setPage(1);
            setApplied(search.trim());
          }}
          onReset={() => {
            setSearch('');
            setPage(1);
            setApplied('');
          }}
          placeholder="Search suppressed addresses"
          label="Search suppressed addresses"
        />
      </div>

      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Nothing suppressed yet"
          description="Unsubscribes, complaints and hard bounces are added here automatically."
        />
      ) : (
        <>
          <DataTable
            items={data.items}
            getKey={(entry) => entry.id}
            columns={[
              {
                key: 'email',
                header: 'Email',
                primary: true,
                cell: (entry) => (
                  <span className="block break-all font-mono text-xs">{entry.email}</span>
                ),
              },
              {
                key: 'reason',
                header: 'Reason',
                cell: (entry) => (
                  <Badge tone={SUPPRESSION_TONES[entry.reason]}>
                    {entry.reason.toLowerCase()}
                  </Badge>
                ),
              },
              {
                key: 'source',
                header: 'Source',
                hide: 'lg',
                cell: (entry) => (
                  <span className="text-xs text-slate-500">{entry.source ?? '—'}</span>
                ),
              },
              {
                key: 'added',
                header: 'Added',
                hide: 'md',
                cell: (entry) => (
                  <span className="whitespace-nowrap text-slate-500">
                    {formatDate(entry.createdAt)}
                  </span>
                ),
              },
            ]}
            actions={(entry) => (
              <Button size="sm" variant="danger" onClick={() => void handleRemove(entry)}>
                Remove
              </Button>
            )}
          />
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function PasswordPanel() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      // The API revokes every session, including this one.
      router.replace('/login');
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Card
      title="Change your password"
      description="Changing your password signs you out of every device."
    >
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Current password" htmlFor="currentPassword" error={fieldErrors['currentPassword']}>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          error={fieldErrors['newPassword']}
          hint="At least 12 characters, with upper case, lower case and a digit."
        >
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="confirmPassword">
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Stacks on a phone: side by side, a long label and a long value cannot both
    // fit on one narrow line, and neither is safe to truncate here.
    <div className="flex flex-col gap-0.5 border-b border-slate-100 pb-2 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-900 sm:text-right">{children}</dd>
    </div>
  );
}
