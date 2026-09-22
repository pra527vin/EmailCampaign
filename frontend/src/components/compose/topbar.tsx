'use client';

import { useEditor } from '@craftjs/core';
import {
  Check,
  Code2,
  Eye,
  FilePlus2,
  Keyboard,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { SaveState } from '@/components/compose/auto-save';
import { ExportModal } from '@/components/compose/export-modal';
import { SaveTemplateModal } from '@/components/compose/save-template-modal';
import { ShortcutsGuide } from '@/components/compose/shortcuts-guide';
import { Button, Input } from '@/components/ui';
import { saveDesign } from '@/lib/compose/editor-store';
import { MOD_KEY } from '@/lib/compose/platform';

const SAVE_LABEL: Record<Exclude<SaveState, 'idle'>, string> = {
  saving: 'Saving…',
  saved: 'Draft saved',
  error: 'Not saved',
};

/**
 * The composer's own toolbar.
 *
 * It carries no branding: the app shell around it already says where you are,
 * so this is purely the controls for the canvas below.
 *
 * Subject and preview text are folded away by default. They belong to the
 * design -- the preheader is written into the exported HTML -- but they are
 * not what someone is doing most of the time, and a permanently open pair of
 * fields would push the canvas down for no reason.
 */
export function Topbar({
  subject,
  setSubject,
  preheader,
  setPreheader,
  saveState,
  onSaveState,
  onSaved,
  onStartNew,
  onReset,
}: {
  subject: string;
  setSubject: (value: string) => void;
  preheader: string;
  setPreheader: (value: string) => void;
  saveState: SaveState;
  onSaveState: (state: SaveState) => void;
  onSaved: () => void;
  onStartNew: () => void;
  onReset: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const { canUndo, canRedo, actions, enabled, query } = useEditor((state, editorQuery) => ({
    canUndo: editorQuery.history.canUndo(),
    canRedo: editorQuery.history.canRedo(),
    enabled: state.options.enabled,
  }));

  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flash.current) clearTimeout(flash.current);
    },
    [],
  );

  /**
   * Write the draft out now instead of waiting for the debounce.
   *
   * `AutoSave` already keeps up with the canvas, so this is not about the
   * bytes -- it is about not having to trust a timer nobody can see. The tick
   * that replaces the icon is the whole point; without it this button would be
   * indistinguishable from doing nothing.
   */
  const saveDraft = useCallback(async (): Promise<void> => {
    onSaveState('saving');
    const ok = await saveDesign({ craft: query.serialize(), subject, preheader });
    onSaveState(ok ? 'saved' : 'error');
    if (!ok) return;
    setJustSaved(true);
    if (flash.current) clearTimeout(flash.current);
    flash.current = setTimeout(() => setJustSaved(false), 1500);
  }, [query, subject, preheader, onSaveState]);

  // Unlike the block shortcuts, this one works inside a text field too: the
  // reflex to save mid-sentence is exactly when it is reached for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      // Whatever the browser would offer to save, it is not this.
      event.preventDefault();
      void saveDraft();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveDraft]);

  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => actions.history.undo()}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
            className={iconButton}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => actions.history.redo()}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
            className={iconButton}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => void saveDraft()}
            title={`Save the draft in this browser (${MOD_KEY}+S)`}
            aria-label="Save draft"
            className={iconButton}
          >
            {justSaved ? <Check size={16} className="text-accent-600" /> : <Save size={16} />}
          </button>
          <button
            type="button"
            onClick={onStartNew}
            title="Discard this design and start from the template layout"
            aria-label="Start a new template"
            className={iconButton}
          >
            <FilePlus2 size={16} />
          </button>
          <button
            type="button"
            onClick={onReset}
            title="Empty the canvas and delete the saved draft"
            aria-label="Empty the canvas"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            className={iconButton}
          >
            <Keyboard size={16} />
          </button>

          {saveState !== 'idle' ? (
            <span
              className={clsx(
                'ml-1 text-2xs',
                saveState === 'error' ? 'text-red-600' : 'text-slate-400',
              )}
            >
              {SAVE_LABEL[saveState]}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={showMeta ? 'subtle' : 'ghost'}
            onClick={() => setShowMeta((current) => !current)}
            aria-expanded={showMeta}
          >
            Subject &amp; preview text
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => actions.setOptions((options) => (options.enabled = !enabled))}
          >
            {enabled ? <Eye size={14} /> : <Pencil size={14} />}
            {enabled ? 'Preview' : 'Editing'}
          </Button>

          <Button type="button" size="sm" variant="secondary" onClick={() => setExportOpen(true)}>
            <Code2 size={14} />
            Export HTML
          </Button>

          <Button type="button" size="sm" onClick={() => setSaveOpen(true)}>
            Save as template
          </Button>
        </div>
      </div>

      {showMeta ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <label className="flex min-w-[260px] flex-1 items-center gap-2">
            <span className="w-24 shrink-0 text-2xs font-bold uppercase tracking-[0.12em] text-slate-400">
              Subject
            </span>
            <Input
              sizing="sm"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Your subject line"
            />
          </label>
          <label className="flex min-w-[260px] flex-1 items-center gap-2">
            <span className="w-24 shrink-0 text-2xs font-bold uppercase tracking-[0.12em] text-slate-400">
              Preview text
            </span>
            <Input
              sizing="sm"
              value={preheader}
              onChange={(event) => setPreheader(event.target.value)}
              placeholder="The short line shown next to the subject in the inbox"
            />
          </label>
        </div>
      ) : null}

      {/*
        Mounted only while open, not passed `open` and left mounted: both call
        `useEditor()` with no selector, which subscribes to every store update.
        craft dispatches those synchronously while `<Frame>` builds its node
        tree on the initial render, and either modal sitting there already
        subscribed -- as it would if always mounted, since these render before
        `<Frame>` in the tree -- means React is asked to update it while a
        different component (`Frame`) is still rendering. See the
        `subscribersMounted` comment in email-editor.tsx for the same failure
        mode with FontLoader/AutoSave.
      */}
      {exportOpen ? (
        <ExportModal
          open={exportOpen}
          subject={subject}
          preheader={preheader}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
      {saveOpen ? (
        <SaveTemplateModal
          open={saveOpen}
          subject={subject}
          onSaved={onSaved}
          onClose={() => setSaveOpen(false)}
        />
      ) : null}
      <ShortcutsGuide open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
