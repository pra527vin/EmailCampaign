'use client';

import { useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Modal } from '@/components/modal';
import { toVariableKey } from '@/lib/csv-preview';
import { Alert, Button, Field, IconButton, Input, VariableChip } from '@/components/ui';
import type { Recipient } from '@/lib/types';

/**
 * Edits one recipient of a list.
 *
 * Fixes a typo in an address, fills in a missing name, or corrects a custom
 * field before a campaign goes out. Custom-field keys are the same
 * `{{placeholders}}` the CSV import produced, so a value typed here lands in
 * exactly the same slot a template already refers to.
 */

type CustomField = { id: number; key: string; value: string };

/** Core fields, in the order they appear in the form. */
const TEXT_FIELDS = [
  { key: 'name', label: 'Full name', placeholder: 'Ada Lovelace' },
  { key: 'firstName', label: 'First name', placeholder: 'Ada' },
  { key: 'lastName', label: 'Last name', placeholder: 'Lovelace' },
  { key: 'company', label: 'Company', placeholder: 'Analytical Engines Ltd' },
  { key: 'storeName', label: 'Store name', placeholder: 'Ada Goods' },
  { key: 'storeUrl', label: 'Store URL', placeholder: 'https://ada.example.com' },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]['key'];

export function RecipientModal({
  listId,
  recipient,
  onClose,
  onSaved,
}: {
  listId: string;
  recipient: Recipient | null;
  onClose: () => void;
  onSaved: (updated: Recipient) => void;
}) {
  const [email, setEmail] = useState(recipient?.email ?? '');
  const [text, setText] = useState<Record<TextFieldKey, string>>({
    name: recipient?.name ?? '',
    firstName: recipient?.firstName ?? '',
    lastName: recipient?.lastName ?? '',
    company: recipient?.company ?? '',
    storeName: recipient?.storeName ?? '',
    storeUrl: recipient?.storeUrl ?? '',
  });
  const [custom, setCustom] = useState<CustomField[]>(
    Object.entries(recipient?.customFields ?? {}).map(([key, value], index) => ({
      id: index,
      key,
      value: String(value),
    })),
  );
  const [nextId, setNextId] = useState(1000);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!recipient) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!recipient) return;

    setError(null);
    setFieldErrors({});

    if (!email.trim()) {
      setFieldErrors({ email: 'An email address is required' });
      return;
    }

    // Empty keys are dropped rather than rejected: a half-filled row is a
    // normal thing to leave behind while editing.
    const customFields: Record<string, string> = {};
    for (const field of custom) {
      const key = toVariableKey(field.key);
      if (!key || !field.value.trim()) continue;
      customFields[key] = field.value.trim();
    }

    setSaving(true);
    try {
      const updated = await api.patch<Recipient>(
        `/recipient-lists/${listId}/recipients/${recipient.id}`,
        { email: email.trim(), ...text, customFields },
      );
      onSaved(updated);
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Edit recipient"
      description="Changes apply to this list. Campaigns that have already sent are unaffected."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="recipient-form" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="recipient-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Email address"
          htmlFor="recipient-email"
          error={fieldErrors['email']}
          required
          hint="Must be unique within this list."
        >
          <Input
            id="recipient-email"
            type="email"
            value={email}
            invalid={Boolean(fieldErrors['email'])}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`recipient-${field.key}`}
              error={fieldErrors[field.key]}
            >
              <Input
                id={`recipient-${field.key}`}
                value={text[field.key]}
                placeholder={field.placeholder}
                maxLength={2000}
                onChange={(event) =>
                  setText((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </Field>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-800">Custom fields</p>
              <p className="text-xs text-slate-500">
                Each becomes a <VariableChip name="variable" braces /> a template can use.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setCustom((current) => [...current, { id: nextId, key: '', value: '' }]);
                setNextId((id) => id + 1);
              }}
            >
              Add field
            </Button>
          </div>

          {custom.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No custom fields on this recipient.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {custom.map((field) => (
                <div key={field.id} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                  <Input
                    aria-label="Field name"
                    sizing="sm"
                    className="w-full sm:w-44"
                    value={field.key}
                    maxLength={60}
                    placeholder="plan_tier"
                    onChange={(event) =>
                      setCustom((current) =>
                        current.map((item) =>
                          item.id === field.id ? { ...item, key: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Field value"
                    sizing="sm"
                    className="min-w-0 flex-1"
                    value={field.value}
                    maxLength={2000}
                    placeholder="Pro"
                    onChange={(event) =>
                      setCustom((current) =>
                        current.map((item) =>
                          item.id === field.id ? { ...item, value: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <IconButton
                    label={`Remove ${field.key || 'field'}`}
                    onClick={() =>
                      setCustom((current) => current.filter((item) => item.id !== field.id))
                    }
                    className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    &times;
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
