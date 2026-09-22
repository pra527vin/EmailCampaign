'use client';

import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';

/**
 * The two ways to throw the canvas away, and what each one leaves behind.
 *
 * Both delete the saved draft, which is the part a reload cannot undo, so both
 * are confirmed. They differ only in what replaces it: nothing, or the layout a
 * first-time canvas starts from.
 */
export type DiscardMode = 'empty' | 'new';

const COPY: Record<DiscardMode, { title: string; action: string; body: string }> = {
  empty: {
    title: 'Empty the canvas?',
    action: 'Empty canvas',
    body:
      'Every block is removed and the saved draft is deleted. Your subject line, preview text and ' +
      'Brand Kit are kept, and any template you have already saved is untouched. This cannot be ' +
      'undone.',
  },
  new: {
    title: 'Start a new template?',
    action: 'Start new template',
    body:
      'The canvas goes back to the starter layout and the unfinished draft is deleted. Your Brand ' +
      'Kit is kept, and any template you have already saved is untouched. This cannot be undone.',
  },
};

export function DiscardDialog({
  mode,
  open,
  onCancel,
  onConfirm,
}: {
  mode: DiscardMode;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = COPY[mode];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={copy.title}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {copy.action}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle size={16} />
        </span>
        <p className="text-xs leading-relaxed text-slate-700">{copy.body}</p>
      </div>
    </Modal>
  );
}
