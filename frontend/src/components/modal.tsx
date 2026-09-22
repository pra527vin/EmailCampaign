'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Accessible modal dialog.
 *
 * Deliberately not `<dialog>`: Safari support for `showModal` is recent enough
 * that a plain overlay is the safer choice, and this keeps focus behaviour
 * explicit. Handles Escape, backdrop click, background scroll lock, and returns
 * focus to whatever opened it.
 */
export function Modal({
  open,
  title,
  description,
  meta,
  onClose,
  children,
  footer,
  size = 'md',
  backdrop = 'default',
  placement = 'top',
}: {
  open: boolean;
  title: string;
  description?: string;
  /** Optional status chips or counts, shown on the title's own line. */
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /**
   * `blurred` when what is behind the dialog is part of the question being
   * asked -- the dialog sits over it lightly, obscured enough to read as
   * inactive but still legible.
   */
  backdrop?: 'default' | 'blurred';
  /**
   * `top` keeps a dialog near where the eye already is, which suits the forms
   * that make up most of them. `center` is for the ones that are the whole
   * screen's business rather than a step in something else.
   */
  placement?: 'top' | 'center';
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      // Minimal focus trap: keep Tab cycling inside the panel.
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first field so the dialog is usable from the keyboard at once.
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('input, select, textarea, button')
        ?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto p-3 sm:p-4 ${
        placement === 'center' ? 'items-center' : 'items-start pt-[6vh] sm:pt-[8vh]'
      } ${
        backdrop === 'blurred'
          ? 'bg-slate-900/25 backdrop-blur-[2px]'
          : 'bg-slate-900/40 backdrop-blur-[1px]'
      }`}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes it, so
        // a drag that began inside the form does not dismiss the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`w-full animate-scale-in overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 ${
          size === 'xl' ? 'max-w-6xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#EEF1F5] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                {title}
              </h2>
              {meta}
            </div>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            &times;
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
