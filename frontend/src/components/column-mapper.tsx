'use client';

import clsx from 'clsx';
import { Badge, Input, Select, VariableChip } from '@/components/ui';
import {
  IDENTITY_TARGETS,
  placeholderFor,
  toVariableKey,
  type ColumnChoice,
  type ColumnTarget,
} from '@/lib/csv-preview';

/**
 * Column mapping for a CSV upload.
 *
 * The importer can guess most headers, but only the uploader knows that
 * "Contact" is the address or that "Tier" should be `{{plan_tier}}`. Every
 * column shows the placeholder it will produce, so what you see here is exactly
 * what a template can use afterwards.
 */

const TARGET_OPTIONS: ReadonlyArray<{ value: ColumnTarget; label: string }> = [
  { value: 'email', label: 'Email address (required)' },
  { value: 'name', label: 'Full name' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'company', label: 'Merchant / company' },
  { value: 'storeName', label: 'Store name' },
  { value: 'storeUrl', label: 'Store URL' },
  { value: 'custom', label: 'Custom variable' },
  { value: 'ignore', label: 'Do not import' },
];

/** The one rule the import cannot proceed without, plus clashes worth blocking. */
export function validateMapping(choices: ColumnChoice[]): string | null {
  const emailColumns = choices.filter((choice) => choice.target === 'email');
  if (emailColumns.length === 0) {
    return 'Choose which column holds the email address.';
  }
  if (emailColumns.length > 1) {
    return 'Only one column can be the email address.';
  }

  // A row has to say who it is for as well as where to send. Either side
  // satisfies it, which is why this is one check rather than two.
  if (!choices.some((choice) => IDENTITY_TARGETS.includes(choice.target))) {
    return 'Map a column to a name or to a merchant, so messages can address the recipient.';
  }

  const coreTargets = choices
    .filter((choice) => choice.target !== 'custom' && choice.target !== 'ignore')
    .map((choice) => choice.target);
  const duplicate = coreTargets.find(
    (target, index) => coreTargets.indexOf(target) !== index,
  );
  if (duplicate) {
    const label = TARGET_OPTIONS.find((option) => option.value === duplicate)?.label ?? duplicate;
    return `Two columns are mapped to ${label}. Each field can come from one column.`;
  }

  return null;
}

/** Placeholders produced more than once; the importer will suffix the repeats. */
function duplicatePlaceholders(choices: ColumnChoice[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const choice of choices) {
    const placeholder = placeholderFor(choice);
    if (!placeholder) continue;
    if (seen.has(placeholder)) duplicates.add(placeholder);
    seen.add(placeholder);
  }
  return duplicates;
}

export function ColumnMapper({
  choices,
  rows,
  onChange,
}: {
  choices: ColumnChoice[];
  /** Sample data rows, aligned to the choices by index. */
  rows: string[][];
  onChange: (choices: ColumnChoice[]) => void;
}) {
  const duplicates = duplicatePlaceholders(choices);

  const update = (index: number, patch: Partial<ColumnChoice>) => {
    onChange(
      choices.map((choice) => (choice.index === index ? { ...choice, ...patch } : choice)),
    );
  };

  return (
    <div className="space-y-2">
      <div className="hidden gap-3 px-3 text-[calc(11px*var(--type-scale))] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[1.4fr_1.1fr_1.1fr]">
        <span>CSV column</span>
        <span>Import as</span>
        <span>Use in a template as</span>
      </div>

      {choices.map((choice) => {
        const samples = rows
          .map((row) => row[choice.index])
          .filter((value): value is string => Boolean(value?.trim()))
          .slice(0, 2);
        const placeholder = placeholderFor(choice);
        const clashes = placeholder !== null && duplicates.has(placeholder);

        return (
          <div
            key={choice.index}
            className={clsx(
              'grid gap-3 rounded-lg border p-3 transition lg:grid-cols-[1.4fr_1.1fr_1.1fr] lg:items-start',
              choice.target === 'ignore'
                ? 'border-slate-200 bg-slate-50 opacity-70'
                : 'border-slate-200 bg-white',
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {choice.header || <span className="italic text-slate-400">(no header)</span>}
              </p>
              <p className="truncate text-xs text-slate-500">
                {samples.length > 0 ? samples.join(' · ') : 'no sample values'}
              </p>
            </div>

            <div>
              <Select
                aria-label={`Import "${choice.header}" as`}
                sizing="sm"
                value={choice.target}
                onChange={(event) =>
                  update(choice.index, {
                    target: event.target.value as ColumnTarget,
                    // Seed a sensible variable name the first time a column
                    // becomes custom, so the field is never empty.
                    key:
                      event.target.value === 'custom' && !choice.key
                        ? toVariableKey(choice.header)
                        : choice.key,
                  })
                }
              >
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="min-w-0">
              {choice.target === 'custom' ? (
                <>
                  <Input
                    aria-label={`Placeholder name for "${choice.header}"`}
                    sizing="sm"
                    value={choice.key}
                    maxLength={60}
                    invalid={clashes}
                    placeholder={`column_${choice.index + 1}`}
                    onChange={(event) => update(choice.index, { key: event.target.value })}
                  />
                  <p className="mt-1 truncate text-[calc(11px*var(--type-scale))] text-slate-500">
                    {placeholder && <VariableChip name={placeholder} braces />}
                  </p>
                </>
              ) : choice.target === 'ignore' ? (
                <Badge tone="muted">not imported</Badge>
              ) : (
                <div className="flex items-center">
                  {placeholder && <VariableChip name={placeholder} braces />}
                </div>
              )}
              {clashes && (
                <p className="mt-1 text-[calc(11px*var(--type-scale))] font-medium text-red-600">
                  Another column already uses this name; the import will add a suffix.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
