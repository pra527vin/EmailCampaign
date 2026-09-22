'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { HINT, SECTION_TITLE } from '@/components/compose/inputs';

/**
 * The markup a block contributes to the email, foldable.
 *
 * This is the composer's honesty check: an inserted image URL is easy to get
 * subtly wrong -- a share page instead of a file, a host that only serves its
 * own site -- and the canvas can hide that by proxying the picture. Showing
 * the real markup lets someone verify what will actually be sent before they
 * send it.
 *
 * Collapsed by default, because it is a check rather than part of composing.
 */
export function HtmlDisclosure({
  html,
  facts,
  note,
}: {
  html: string;
  /** Label/value pairs summarising what the markup resolves to. */
  facts: ReadonlyArray<{ label: string; value: ReactNode; truncate?: boolean }>;
  note: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-2xs font-semibold text-slate-700 transition-colors hover:text-brand-700"
      >
        <span className={SECTION_TITLE}>Email HTML</span>
        <span className="text-2xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-700">
            {html}
          </pre>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-2xs text-slate-500">
            {facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt>{fact.label}</dt>
                <dd className={fact.truncate ? 'truncate text-slate-700' : 'text-slate-700'}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className={`mt-2 ${HINT}`}>{note}</p>
        </>
      ) : null}
    </>
  );
}
