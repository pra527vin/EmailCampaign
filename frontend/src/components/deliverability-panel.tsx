'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Alert, Badge, Button, Card, Spinner } from '@/components/ui';
import type { DeliverabilityFinding, DomainAuthenticationReport } from '@/lib/types';

/**
 * Domain authentication status.
 *
 * Where a campaign lands is decided mostly before the message is read: whether
 * the receiver can prove the sender is who they claim to be. This panel reports
 * that plainly and gives the exact DNS record to publish, because the fix is
 * always in DNS rather than in the application.
 */

const LEVEL_TONE = {
  ok: 'success',
  info: 'info',
  warning: 'warning',
  error: 'danger',
} as const;

const LEVEL_LABEL = {
  ok: 'Pass',
  info: 'Check',
  warning: 'Improve',
  error: 'Action needed',
} as const;

function CopyableRecord({ record }: { record: NonNullable<DeliverabilityFinding['record']> }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[calc(11px*var(--type-scale))] font-semibold uppercase tracking-wide text-slate-500">
          Publish this record
        </p>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(record.value).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            );
          }}
        >
          {copied ? 'Copied' : 'Copy value'}
        </Button>
      </div>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-slate-500">Type</dt>
          <dd className="font-mono text-slate-800">{record.type}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-slate-500">Name</dt>
          <dd className="min-w-0 break-all font-mono text-slate-800">{record.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-slate-500">Value</dt>
          <dd className="min-w-0 break-all font-mono text-slate-800">{record.value}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DeliverabilityPanel() {
  const [report, setReport] = useState<DomainAuthenticationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.get<DomainAuthenticationReport>('/settings/deliverability'));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failures = report?.findings.filter((finding) => finding.level === 'error').length ?? 0;

  return (
    <Card
      title="Domain authentication"
      description="SPF, DKIM and DMARC for the sending domain. These decide whether mail is trusted."
      actions={
        <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
          Re-check DNS
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {!report ? (
        <Spinner label="Checking DNS" />
      ) : (
        <>
          <div className="mb-4">
            {report.passes ? (
              <Alert tone="success" title={`${report.domain} is authenticated`}>
                Nothing blocking. Placement now depends on reputation: consistent volume, low
                bounce and complaint rates, and recipients who want the mail.
              </Alert>
            ) : (
              <Alert
                tone="error"
                title={`${failures} problem${failures === 1 ? '' : 's'} on ${report.domain}`}
              >
                Until these are fixed, messages are likely to be filtered or rejected no matter
                what they contain. Each fix is a DNS record at your domain registrar.
              </Alert>
            )}
          </div>

          <ul className="space-y-2.5">
            {report.findings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                  <Badge tone={LEVEL_TONE[finding.level]}>{LEVEL_LABEL[finding.level]}</Badge>
                </div>
                <p
                  className={
                    finding.level === 'ok'
                      ? 'mt-1 break-all font-mono text-xs text-slate-600'
                      : 'mt-1 text-xs leading-relaxed text-slate-600'
                  }
                >
                  {finding.detail}
                </p>
                {finding.record && <CopyableRecord record={finding.record} />}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            DNS changes can take up to 48 hours to propagate. Nothing in this application can put a
            message in a particular inbox tab — that is decided by the receiving provider from
            authentication, sender reputation and how recipients engage.
          </p>
        </>
      )}
    </Card>
  );
}
