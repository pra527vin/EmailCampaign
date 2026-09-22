'use client';

import { FilePlus2, History } from 'lucide-react';
import { Modal } from '@/components/modal';
import { Button, formatDate } from '@/components/ui';
import type { StoredDesign } from '@/lib/compose/editor-store';

/**
 * The choice that greets a returning draft.
 *
 * The design is restored and drawn first, and this opens over it with the
 * canvas blurred behind. That order is the point: the question is whether this
 * is the thing you meant to carry on with, and a date and a subject line are a
 * poor substitute for seeing it.
 *
 * Dismissing -- Escape, the backdrop, the close button -- continues, because
 * the design is already on the canvas and carrying on is what leaving a dialog
 * alone should mean. Starting new goes straight through without a second
 * confirmation: the text below is that confirmation.
 */
export function ResumeDialog({
  design,
  open,
  onContinue,
  onStartNew,
}: {
  design: StoredDesign;
  open: boolean;
  onContinue: () => void;
  onStartNew: () => void;
}) {
  return (
    <Modal
      open={open}
      backdrop="blurred"
      placement="center"
      onClose={onContinue}
      title="Carry on with your unfinished design?"
      description={`Last saved ${formatDate(design.savedAt)}.`}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onStartNew}>
            <FilePlus2 size={14} />
            Start a new template
          </Button>
          <Button type="button" onClick={onContinue}>
            <History size={14} />
            Continue
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-2xs font-bold uppercase tracking-[0.12em] text-slate-400">Subject</p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-900">
          {design.subject || 'No subject yet'}
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        It is already on the canvas behind this. Continue to pick it up, or start a new template
        &mdash; which deletes this draft and cannot be undone. Templates you have already saved are
        not affected.
      </p>
    </Modal>
  );
}
