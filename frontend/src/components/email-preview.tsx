'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Alert, SegmentedControl, VariableChip } from '@/components/ui';
import type { EmailPreview } from '@/lib/types';

type Device = 'desktop' | 'mobile';
type Mode = 'html' | 'text' | 'headers';

/**
 * Renders a preview of the exact message the worker will build.
 *
 * The HTML is displayed inside a sandboxed iframe with `srcDoc`. The sandbox
 * attribute is empty on purpose: no scripts, no forms, no same-origin access.
 * The backend has already sanitised the markup; the sandbox is the second layer
 * so that a template can never execute anything in the operator's session.
 */
export function EmailPreviewPane({
  preview,
  loading = false,
  fill = false,
}: {
  preview: EmailPreview | null;
  loading?: boolean;
  /**
   * Grow the rendered message to whatever height the container has.
   *
   * In the editor column the preview is one card among several and a fixed
   * height keeps the page predictable. Full screen, a 36rem box floating in a
   * tall empty page is the wrong shape, so the message takes the room.
   */
  fill?: boolean;
}) {
  const [device, setDevice] = useState<Device>('desktop');
  const [mode, setMode] = useState<Mode>('html');

  if (loading) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500',
          fill ? 'h-full' : 'h-80',
        )}
      >
        Building preview…
      </div>
    );
  }

  if (!preview) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500',
          fill ? 'h-full' : 'h-80',
        )}
      >
        Select a template to see a preview.
      </div>
    );
  }

  return (
    <div className={clsx('space-y-3', fill && 'flex h-full flex-col')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Preview format"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'html', label: 'HTML' },
            { value: 'text', label: 'Plain text' },
            { value: 'headers', label: 'Headers' },
          ]}
        />

        {mode === 'html' && (
          <SegmentedControl
            label="Preview width"
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: 'Desktop' },
              { value: 'mobile', label: 'Mobile' },
            ]}
          />
        )}
      </div>

      <dl className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <HeaderRow label="From" value={preview.from} />
        <HeaderRow label="To" value={preview.to} />
        {preview.replyTo && <HeaderRow label="Reply-To" value={preview.replyTo} />}
        <HeaderRow label="Subject" value={preview.subject} strong />
      </dl>

      {preview.warnings?.map((warning) => (
        <Alert
          key={warning.code}
          tone={warning.level === 'error' ? 'error' : 'warning'}
          title={warning.level === 'error' ? 'This template will not work in email' : 'Check this'}
        >
          {warning.message}
        </Alert>
      ))}

      {preview.missingVariables.length > 0 && (
        <Alert tone="warning" title="Unfilled variables">
          <p>These variables have no value for the sample recipient and will render empty:</p>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {preview.missingVariables.map((name) => (
              <VariableChip key={name} name={name} braces />
            ))}
          </span>
          <p className="mt-1.5">
            Give them a fallback with <code className="font-mono">{'{{name | default}}'}</code>.
          </p>
        </Alert>
      )}

      {preview.sampleSource === 'sample' && (
        <p className="text-xs text-slate-500">
          Rendered with placeholder data — no recipient list is attached yet.
        </p>
      )}

      {mode === 'html' && (
        <div
          className={clsx(
            'flex justify-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-2 sm:p-3',
            fill && 'min-h-0 flex-1',
          )}
        >
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview.html}
            className={clsx(
              'rounded border border-slate-300 bg-white transition-all',
              fill ? 'h-full' : 'h-[28rem] sm:h-[36rem]',
              device === 'mobile' ? 'w-[375px] shrink-0' : 'w-full',
            )}
          />
        </div>
      )}

      {mode === 'text' && (
        <pre
          className={clsx(
            'overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 sm:p-4',
            fill ? 'min-h-0 flex-1' : 'max-h-[28rem] sm:max-h-[36rem]',
          )}
        >
          {preview.text}
        </pre>
      )}

      {mode === 'headers' && (
        <pre
          className={clsx(
            'overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-100 sm:p-4',
            fill ? 'min-h-0 flex-1' : 'max-h-[28rem] sm:max-h-[36rem]',
          )}
        >
          {preview.rawHeaders}
        </pre>
      )}

      <p className="text-xs text-slate-500">
        Unsubscribe link for this recipient:{' '}
        <span className="break-all font-mono text-[calc(11px*var(--type-scale))]">{preview.unsubscribeUrl}</span>
      </p>
    </div>
  );
}

function HeaderRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-slate-500">{label}</dt>
      <dd className={clsx('min-w-0 break-words', strong ? 'font-semibold text-slate-900' : 'text-slate-700')}>
        {value}
      </dd>
    </div>
  );
}
