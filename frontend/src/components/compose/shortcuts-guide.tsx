'use client';

import type { ReactNode } from 'react';
import { BLOCK_GROUPS } from '@/components/compose/toolbox';
import { SECTION_TITLE } from '@/components/compose/inputs';
import { Modal } from '@/components/modal';
import { MOD_KEY as MOD } from '@/lib/compose/platform';

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-[5px] border border-slate-300 bg-slate-100 px-[6px] py-[2px] text-center text-[10.5px] font-semibold text-slate-700">
      {children}
    </kbd>
  );
}

function Row({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-700">{children}</span>
      <span className="flex flex-none items-center gap-1">
        {keys.map((key, index) => (
          <span key={key} className="flex items-center gap-1">
            {index > 0 ? <span className="text-[10.5px] text-slate-400">+</span> : null}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Everything the keyboard can do here.
 *
 * The block list is generated from `BLOCK_GROUPS` -- the same array the rail
 * renders and the key handler reads -- so a new block cannot appear in one
 * place and be missing from the other.
 */
export function ShortcutsGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts work while editing, over the canvas — not inside a text field. Saving is the exception; it works anywhere."
    >
      <p className={`mb-1 ${SECTION_TITLE}`}>Blocks</p>
      <div className="mb-1 divide-y divide-slate-200">
        {BLOCK_GROUPS.flatMap((group) => group.items).map((item) => (
          <Row key={item.type} keys={[item.key.toUpperCase()]}>
            Add {item.name}
          </Row>
        ))}
      </div>
      <p className="mb-4 text-2xs leading-relaxed text-slate-500">
        Adds the block after whatever is selected, or at the end of the email.
      </p>

      <p className={`mb-1 ${SECTION_TITLE}`}>Editing</p>
      <div className="mb-4 divide-y divide-slate-200">
        <Row keys={['Delete']}>Delete the selected block</Row>
        <Row keys={['Esc']}>Deselect</Row>
        <Row keys={[MOD, 'Z']}>Undo</Row>
        <Row keys={[MOD, 'Shift', 'Z']}>Redo</Row>
        <Row keys={[MOD, 'S']}>Save the draft in this browser</Row>
      </div>

      <p className={`mb-1 ${SECTION_TITLE}`}>Logo layers</p>
      <div className="mb-4 divide-y divide-slate-200">
        <Row keys={['Click']}>Select a logo layer on a banner or image</Row>
        <Row keys={['↑', '↓', '←', '→']}>Move the selected logo 1%</Row>
        <Row keys={['Shift', 'arrow']}>Move the selected logo 5%</Row>
        <Row keys={['Delete']}>Remove the selected logo</Row>
      </div>

      <p className={`mb-1 ${SECTION_TITLE}`}>Canvas zoom</p>
      <div className="divide-y divide-slate-200">
        <Row keys={[MOD, '+']}>Zoom in</Row>
        <Row keys={[MOD, '-']}>Zoom out</Row>
        <Row keys={[MOD, '0']}>Reset to 100%</Row>
        <Row keys={[MOD, 'Scroll']}>Zoom, under the cursor</Row>
      </div>
    </Modal>
  );
}
