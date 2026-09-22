'use client';

import { useEditor } from '@craftjs/core';
import { useEffect, useRef } from 'react';
import { saveDesign } from '@/lib/compose/editor-store';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Writes the design to the browser shortly after every change.
 *
 * It lives inside the editor so it can collect the serialised tree, and it is
 * only mounted once the saved design has been restored -- otherwise the first
 * render would overwrite a stored design with an empty canvas.
 *
 * The debounce matters: craft fires a change for every keystroke and every
 * pixel of a drag, and serialising the whole tree on each one would make
 * dragging a logo stutter.
 */
export function AutoSave({
  subject,
  preheader,
  onStatus,
}: {
  subject: string;
  preheader: string;
  onStatus: (state: SaveState) => void;
}) {
  const { craft } = useEditor((_state, query) => ({
    // Collected as a string, so craft only re-renders this on a real change
    // rather than on every identity change inside the tree.
    craft: query.serialize(),
  }));

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const payload = JSON.stringify({ craft, subject, preheader });
    if (last.current === payload) return undefined;

    onStatus('saving');
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      void saveDesign({ craft, subject, preheader }).then((ok) => {
        last.current = payload;
        onStatus(ok ? 'saved' : 'error');
      });
    }, 500);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [craft, subject, preheader, onStatus]);

  return null;
}
