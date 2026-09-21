'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import { EmailPreviewPane } from '@/components/email-preview';
import { Glyph } from '@/components/icons';
import { Modal } from '@/components/modal';
import {
  Alert,
  Button,
  Card,
  Field,
  formatNumber,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Spinner,
  VariableChip,
} from '@/components/ui';
import type {
  Campaign,
  EmailPreview,
  EmailTemplate,
  Paginated,
  RecipientList,
  SenderSettings,
} from '@/lib/types';

/**
 * The composer walks through: pick a list, pick a template, set the subject,
 * preview, then confirm. Nothing is sent until the confirmation step, and the
 * confirmation restates the sender, subject, template and recipient count.
 */
function SendComposer() {
  const router = useRouter();
  const params = useSearchParams();

  const [lists, setLists] = useState<RecipientList[] | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [sender, setSender] = useState<SenderSettings | null>(null);

  const [listId, setListId] = useState(params.get('listId') ?? '');
  const [templateId, setTemplateId] = useState(params.get('templateId') ?? '');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api.get<Paginated<RecipientList>>('/recipient-lists?pageSize=100'),
      api.get<Paginated<EmailTemplate>>('/templates?pageSize=100'),
      api.get<SenderSettings>('/settings/sender'),
    ])
      .then(([listData, templateData, senderData]) => {
        setLists(listData.items.filter((list) => list.status === 'READY' && list.recipientCount > 0));
        setTemplates(templateData.items.filter((template) => template.status !== 'INACTIVE'));
        setSender(senderData);
        setReplyTo(senderData.replyToEmail ?? '');
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  const selectedList = lists?.find((list) => list.id === listId);
  const selectedTemplate = templates?.find((template) => template.id === templateId);

  // Adopt the template's default subject unless the user has typed their own.
  useEffect(() => {
    if (selectedTemplate && !subject) setSubject(selectedTemplate.subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const buildPreview = useCallback(async () => {
    if (!templateId) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(
        await api.post<EmailPreview>('/preview', {
          templateId,
          ...(listId ? { listId } : {}),
          ...(subject ? { subject } : {}),
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPreviewing(false);
    }
  }, [templateId, listId, subject]);

  useEffect(() => {
    if (templateId) void buildPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, listId]);

  const ready = Boolean(listId && templateId && subject.trim() && name.trim());

  async function handleSend() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const campaign = await api.post<Campaign>('/campaigns', {
        name: name.trim(),
        listId,
        templateId,
        subject: subject.trim(),
        ...(replyTo.trim() ? { replyToEmail: replyTo.trim().toLowerCase() } : {}),
      });

      await api.post(`/campaigns/${campaign.id}/start`);
      router.push(`/campaigns/${campaign.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
      setSubmitting(false);
      // The modal stays open: a failed send has to explain itself where the
      // user was standing, and closing would drop them back onto a form with
      // no indication of what went wrong or whether anything was sent.

    }
  }

  if (!lists || !templates) return <Spinner label="Loading" />;

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Each recipient receives their own individually addressed message."
        actions={
          <Button type="button" variant="secondary" onClick={() => router.push('/campaigns')}>
            <Glyph name="back" />
            Back to campaigns
          </Button>
        }
      />

      {/* Hidden while the modal is up, which shows the same message itself --
          two copies of one error is worse than one. */}
      {error && !confirming && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {sender && !sender.dryRun && sender.reachable && sender.senderVerified === false && (
        <div className="mb-4">
          <Alert tone="warning" title="Sender identity is not verified">
            Amazon SES will reject mail from {sender.fromEmail} until the address or its domain is
            verified. <LinkButton href="/settings" variant="ghost">Check settings</LinkButton>
          </Alert>
        </div>
      )}

      {sender?.dryRun && (
        <div className="mb-4">
          <Alert tone="info" title="Dry-run mode is on">
            Messages will be composed and recorded as sent, but nothing is handed to Amazon SES.
          </Alert>
        </div>
      )}

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <Card step={1} title="Choose a recipient list">
            {lists.length === 0 ? (
              <Alert tone="warning">
                No importable lists. <LinkButton href="/lists" variant="ghost">Upload a CSV</LinkButton>
              </Alert>
            ) : (
              <Field label="Recipient list" htmlFor="listId">
                <Select id="listId" value={listId} onChange={(event) => setListId(event.target.value)}>
                  <option value="">Select a list…</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} — {formatNumber(list.recipientCount)} recipients
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {selectedList && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  <strong>{formatNumber(selectedList.recipientCount)}</strong> recipients stored from{' '}
                  {selectedList.sourceFileName}.
                </p>
                <p className="mt-1.5">Available variables:</p>
                <span className="mt-1 flex flex-wrap gap-1">
                  {selectedList.columns.map((column) => (
                    <VariableChip key={column} name={column} />
                  ))}
                </span>
                <p className="mt-1 text-slate-500">
                  Suppressed and unsubscribed addresses are removed automatically at send time.
                </p>
              </div>
            )}
          </Card>

          <Card step={2} title="Choose a template">
            {templates.length === 0 ? (
              <Alert tone="warning">
                No usable templates.{' '}
                <LinkButton href="/templates/new" variant="ghost">Create one</LinkButton>
              </Alert>
            ) : (
              <Field label="Template" htmlFor="templateId">
                <Select
                  id="templateId"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">Select a template…</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.status === 'DRAFT' ? '(draft)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Card>

          <Card step={3} title="Campaign details" collapsible>
            <div className="space-y-4">
              <Field
                label="Campaign name"
                htmlFor="name"
                error={fieldErrors['name']}
                hint="Internal only — recipients never see this."
              >
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="January merchant announcement"
                  maxLength={150}
                />
              </Field>

              <Field
                label="Subject"
                htmlFor="subject"
                error={fieldErrors['subject']}
                hint="Personalisation variables work here."
              >
                <Input
                  id="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  onBlur={() => void buildPreview()}
                  maxLength={500}
                />
              </Field>

              <Field
                label="Reply-to address"
                htmlFor="replyTo"
                error={fieldErrors['replyToEmail']}
                hint="Where replies land. Defaults to the configured reply-to."
              >
                <Input
                  id="replyTo"
                  type="email"
                  value={replyTo}
                  onChange={(event) => setReplyTo(event.target.value)}
                  placeholder="support@example.com"
                />
              </Field>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  Sending from <strong>{sender?.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender?.fromEmail}</strong>
                </p>
                <p className="mt-1 text-slate-500">
                  The sender address comes from the verified SES identity and cannot be changed per campaign.
                </p>
              </div>
            </div>
          </Card>

          {/* Last, because it is the end of the flow: steps 1-3 read top to
              bottom and this is what follows them. Disabled until all four
              required values are set, with the reason stated underneath rather
              than left to be guessed from a greyed-out button. */}
          <div>
            <Button type="button" block size="md" disabled={!ready} onClick={() => setConfirming(true)}>
              Review and send
            </Button>
            {!ready && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Choose a list and a template, and give the campaign a name and a subject.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <Card
            title="Preview"
            description={
              selectedList
                ? 'Rendered with the first recipient from the selected list.'
                : 'Rendered with placeholder data until a list is chosen.'
            }
            actions={
              <Button size="sm" variant="secondary" onClick={buildPreview} loading={previewing} disabled={!templateId}>
                Refresh
              </Button>
            }
          >
            <EmailPreviewPane preview={preview} loading={previewing} />
          </Card>
        </div>
      </div>

      {/* The review is a modal rather than a fourth step.
          Sending is irreversible once SES has the message, so the confirmation
          should interrupt rather than sit at the bottom of a form waiting to be
          scrolled past. Escape and the header cross both cancel; nothing here
          sends until "Start sending" is pressed. */}
      <Modal
        open={confirming}
        size="lg"
        title="Review before sending"
        description="Nothing has been sent yet. Check these, then start."
        onClose={() => {
          if (!submitting) setConfirming(false);
        }}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button variant="success" onClick={handleSend} loading={submitting}>
              Start sending to {formatNumber(selectedList?.recipientCount ?? 0)}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <dl className="space-y-2 text-sm">
            <ConfirmRow label="Campaign" value={name || '—'} />
            <ConfirmRow label="Sender" value={sender?.fromEmail ?? '—'} />
            <ConfirmRow label="Reply-to" value={replyTo || sender?.replyToEmail || 'not set'} />
            <ConfirmRow label="Subject" value={subject || '—'} />
            <ConfirmRow label="Template" value={selectedTemplate?.name ?? '—'} />
            <ConfirmRow
              label="Recipients"
              value={selectedList ? `${formatNumber(selectedList.recipientCount)} addresses` : '—'}
            />
            <ConfirmRow
              label="Estimated duration"
              value={
                selectedList && sender
                  ? estimateDuration(selectedList.recipientCount, sender.configuredSendRate)
                  : '—'
              }
            />
            <ConfirmRow label="Unsubscribe" value="List-Unsubscribe header + in-body link" />
          </dl>

          <Alert tone="info">
            Messages are queued and delivered one per recipient at{' '}
            {sender?.configuredSendRate ?? '—'} messages/second. Nothing is placed in CC or BCC.
          </Alert>

          <Alert tone="warning" title={`Send to ${formatNumber(selectedList?.recipientCount ?? 0)} recipients?`}>
            This starts delivery immediately. You can pause or cancel from the campaign page, but
            messages already handed to SES cannot be recalled. Only send to people who opted in to
            hear from you.
          </Alert>
        </div>
      </Modal>
    </>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 pb-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-slate-900 sm:text-right">{value}</dd>
    </div>
  );
}

function estimateDuration(recipients: number, ratePerSecond: number): string {
  const seconds = Math.ceil(recipients / Math.max(1, ratePerSecond));
  if (seconds < 60) return `about ${seconds} seconds`;
  if (seconds < 3600) return `about ${Math.ceil(seconds / 60)} minutes`;
  return `about ${(seconds / 3600).toFixed(1)} hours`;
}

export default function SendPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SendComposer />
    </Suspense>
  );
}
