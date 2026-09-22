'use client';

import { useEditor } from '@craftjs/core';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useBrandKit } from '@/lib/compose/brand-kit';
import { clearDesign } from '@/lib/compose/editor-store';
import { exportToEmailHtml } from '@/lib/compose/export-html';
import type { EmailTemplate, TemplateStatus } from '@/lib/types';

/**
 * Turns the composed design into a template the rest of the system can use.
 *
 * This is what makes Compose part of MailStrive rather than a drawing tool
 * that happens to emit HTML: the result goes through the same `POST /templates`
 * endpoint the code editor uses, so the server derives the plain-text
 * alternative, extracts the variables, and the template is immediately
 * selectable in a campaign.
 *
 * The draft is cleared once it has been saved. It has become a template the
 * system owns, and leaving it behind would have the composer offer to resume a
 * design that already exists -- editing a copy of something saved, with no
 * indication the two were ever the same.
 */
export function SaveTemplateModal({
  open,
  subject,
  onSaved,
  onClose,
}: {
  open: boolean;
  subject: string;
  /** Empties the canvas, once the design is safely stored server-side. */
  onSaved: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { query } = useEditor();
  const { brand } = useBrandKit();

  const [name, setName] = useState('');
  const [templateSubject, setTemplateSubject] = useState(subject);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TemplateStatus>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Generated up front so an export failure is visible before anything is
  // sent, rather than surfacing as a confusing validation error.
  const html = useMemo(() => {
    if (!open) return '';
    try {
      return exportToEmailHtml({
        json: query.getSerializedNodes(),
        brand,
        subject: templateSubject,
      });
    } catch {
      return '';
    }
  }, [open, query, brand, templateSubject]);

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!html.trim()) {
      setError('This design produced no HTML. Add a block to the canvas first.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.post<EmailTemplate>('/templates', {
        name: name.trim(),
        description: description.trim() || undefined,
        subject: templateSubject.trim(),
        htmlContent: html,
        // Left empty deliberately: the server generates the plain-text half
        // from the HTML, exactly as it does for a hand-written template.
        textContent: '',
        status,
      });
      // Only after the server has it. A failed request leaves the draft where
      // it was, which is the whole reason the draft exists.
      await clearDesign();
      onSaved();
      router.push(`/templates?created=${encodeURIComponent(created.name)}`);
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as template"
      description="The design becomes a template your campaigns can send."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="save-template-form" loading={saving}>
            Save template
          </Button>
        </>
      }
    >
      <form id="save-template-form" onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Template name" htmlFor="template-name" error={fieldErrors['name']} required>
          <Input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={150}
            placeholder="Spring announcement"
          />
        </Field>

        <Field
          label="Default subject"
          htmlFor="template-subject"
          error={fieldErrors['subject']}
          hint="Can be overridden per campaign."
          required
        >
          <Input
            id="template-subject"
            value={templateSubject}
            onChange={(event) => setTemplateSubject(event.target.value)}
            required
            maxLength={500}
            placeholder="A quick update"
          />
        </Field>

        <Field label="Description" htmlFor="template-description">
          <Input
            id="template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            placeholder="Optional note for your team"
          />
        </Field>

        <Field
          label="Status"
          htmlFor="template-status"
          hint="Only active templates can be used in a campaign."
        >
          <Select
            id="template-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TemplateStatus)}
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
          </Select>
        </Field>

        <p className="text-xs text-slate-500">
          The plain-text alternative is generated from this HTML when it is saved, so the message
          still ships both parts. Unsubscribe links are added at send time &mdash; there is no need
          to build one into the design.
        </p>
      </form>
    </Modal>
  );
}
