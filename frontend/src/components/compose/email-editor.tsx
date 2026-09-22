'use client';

import { Editor as CraftEditor, Element, Frame } from '@craftjs/core';
import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AutoSave, type SaveState } from '@/components/compose/auto-save';
import {
  Banner,
  ButtonLink,
  IconRow,
  LinkText,
  resolver,
  Section,
  Text,
} from '@/components/compose/blocks';
import { FontLoader } from '@/components/compose/font-loader';
import { DiscardDialog, type DiscardMode } from '@/components/compose/discard-dialog';
import { RenderNode } from '@/components/compose/render-node';
import { ResumeDialog } from '@/components/compose/resume-dialog';
import { SettingsPanel } from '@/components/compose/settings-panel';
import { Toolbox } from '@/components/compose/toolbox';
import { Topbar } from '@/components/compose/topbar';
import { useZoom, ZoomControl } from '@/components/compose/zoom-control';
import { BrandKitProvider, useBrandKit } from '@/lib/compose/brand-kit';
import { clearDesign, EMPTY_DOC, loadDesign } from '@/lib/compose/editor-store';
import type { StoredDesign } from '@/lib/compose/editor-store';

const DEFAULT_SUBJECT = 'A quick update from us';
const DEFAULT_PREHEADER = 'The short line readers see next to the subject in their inbox.';

/**
 * What a first-time canvas starts from; a reset replaces it with an empty body.
 *
 * A plain function rather than a component: `<Frame>` reads its children as
 * craft nodes, so a wrapper component would be looked up in the resolver and
 * fail.
 */
function starterTemplate() {
  return (
    <Element
      canvas
      is={Section}
      background="#FFFFFF"
      paddingTop={0}
      paddingBottom={0}
      paddingX={0}
      custom={{ displayName: 'Email body' }}
    >
      <Element is={Banner} custom={{ displayName: 'Banner' }} />

      <Element canvas is={Section} custom={{ displayName: 'Section' }}>
        <Text
          text="A headline that says why this arrived"
          tag="h2"
          fontSize={22}
          fontWeight={700}
          color="#0F1B2A"
          align="left"
          lineHeight={1.3}
          paddingY={6}
        />
        <Text
          text="One short paragraph of context. Replace this with the reason you are writing, and keep it to what the reader needs in order to act."
          tag="p"
          fontSize={15}
          fontWeight={400}
          color="#33475B"
          align="left"
          lineHeight={1.6}
          paddingY={6}
        />
        <ButtonLink text="Read more" href="https://example.com" align="left" />
      </Element>

      <Element canvas is={Section} background="#F5F7FA" custom={{ displayName: 'Footer' }}>
        <IconRow />
        <LinkText
          text="View this in your browser"
          href="https://example.com"
          color="#5C6E80"
          underline
          align="center"
          fontSize={12}
        />
      </Element>
    </Element>
  );
}

export function EmailEditor() {
  return (
    <BrandKitProvider>
      <EditorShell />
    </BrandKitProvider>
  );
}

function EditorShell() {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [preheader, setPreheader] = useState(DEFAULT_PREHEADER);

  // `undefined` while the saved design is being read, then a craft JSON string,
  // or `null` for "start from the template below".
  const [doc, setDoc] = useState<string | null | undefined>(undefined);
  const [frameKey, setFrameKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  /** Which confirmation is open, if any. Both throw the canvas away. */
  const [discarding, setDiscarding] = useState<DiscardMode | null>(null);

  /**
   * The draft this session opened with, while the dialog about it is up.
   *
   * It is applied to the canvas immediately -- this only decides whether the
   * question is still being asked.
   */
  const [restored, setRestored] = useState<StoredDesign | null>(null);

  /**
   * craft builds its node tree while `<Frame>` renders, dispatching store
   * updates mid-render. Anything subscribed to that store -- FontLoader and
   * AutoSave both are -- would then be told to update during a different
   * component's render, which React refuses:
   *
   *   Cannot update a component (`FontLoader`) while rendering a different one
   *
   * So the subscribers mount one commit later, once the tree already exists.
   * Neither needs to be there for the first paint: the fonts and the first
   * autosave are both a frame behind at most.
   */
  const [subscribersMounted, setSubscribersMounted] = useState(false);

  /**
   * The tree the Frame is about to be rebuilt with, while the subscribers are
   * coming down. Wrapped in an object because `null` is a real target -- it
   * means the starter template -- and would otherwise read as "nothing
   * pending".
   */
  const [pending, setPending] = useState<{ doc: string | null } | null>(null);

  useEffect(() => {
    if (pending) return;
    setSubscribersMounted(true);
  }, [frameKey, pending]);

  // A rebuild takes two commits for the same reason: unmount the subscribers
  // first, then swap the Frame, so the new tree is never built while anything
  // is listening.
  useEffect(() => {
    if (!pending) return;
    setDoc(pending.doc);
    setFrameKey((current) => current + 1);
    setPending(null);
  }, [pending]);

  /** Replace the canvas with `next`, or with the starter template for `null`. */
  const rebuild = (next: string | null): void => {
    setSubscribersMounted(false);
    setPending({ doc: next });
  };

  const { attachRef: canvasRef, ...zoom } = useZoom();
  const { brand } = useBrandKit();

  const width = device === 'desktop' ? 600 : 375;

  useEffect(() => {
    let alive = true;
    loadDesign(resolver)
      .then((saved) => {
        if (!alive) return;
        if (saved) {
          setSubject(saved.subject || DEFAULT_SUBJECT);
          setPreheader(saved.preheader || DEFAULT_PREHEADER);
          setDoc(saved.craft);
          setRestored(saved);
        } else {
          setDoc(null);
        }
      })
      .catch(() => {
        if (alive) setDoc(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Throw the canvas away and start again from `next`.
   *
   * The canvas is swapped before the delete rather than after, so `AutoSave`
   * is already unmounted -- and its pending debounce already cancelled -- by
   * the time the stored design goes. The other order leaves a window in which
   * a timer set moments ago writes the draft back out.
   */
  const discard = async (next: string | null): Promise<void> => {
    if (next === null) {
      setSubject(DEFAULT_SUBJECT);
      setPreheader(DEFAULT_PREHEADER);
    }
    setRestored(null);
    setDiscarding(null);
    rebuild(next);
    await clearDesign();
  };

  /** What the save modal calls once the design is safely a template. */
  const startNew = (): void => void discard(null);

  // Nothing mounts until the design is in hand: craft builds its node tree
  // during the first render of <Frame>, and a tree that arrives later makes
  // every already-subscribed component update mid-render.
  if (doc === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Restoring your design&hellip;
      </div>
    );
  }

  return (
    <CraftEditor resolver={resolver} onRender={RenderNode}>
      {subscribersMounted ? (
        <>
          <FontLoader />
          <AutoSave subject={subject} preheader={preheader} onStatus={setSaveState} />
        </>
      ) : null}

      <div className="flex h-full min-h-0 flex-col">
        <Topbar
          subject={subject}
          setSubject={setSubject}
          preheader={preheader}
          setPreheader={setPreheader}
          saveState={saveState}
          onSaveState={setSaveState}
          onSaved={startNew}
          onStartNew={() => setDiscarding('new')}
          onReset={() => setDiscarding('empty')}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[248px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
            <Toolbox />
          </aside>

          <main
            ref={canvasRef}
            className="compose-canvas compose-canvas-scroll relative flex min-w-0 flex-1 flex-col items-center overflow-y-auto bg-slate-100 px-6 py-8"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
                {(
                  [
                    { value: 'desktop', label: '600px', Icon: Monitor },
                    { value: 'mobile', label: '375px', Icon: Smartphone },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDevice(value)}
                    aria-pressed={device === value}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-2xs font-semibold transition-colors',
                      device === value
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <ZoomControl {...zoom} />
            </div>

            {/* `zoom` rather than `transform: scale`, because craft measures
                elements with getBoundingClientRect to decide where a drop
                lands, and a scaled element reports its unscaled box. */}
            <div style={{ zoom: zoom.zoom }}>
              {/* `compose-email` is what makes this an email rather than a
                  page: see `globals.css`. No rounding and no clipping either,
                  because an inbox gives the message neither. */}
              <div
                className="compose-email shrink-0 bg-white shadow-card transition-all duration-200"
                style={{ width, fontFamily: brand.fontFamily }}
              >
                <Frame key={frameKey} data={doc ?? undefined}>
                  {starterTemplate()}
                </Frame>
              </div>
            </div>

            <p className="mt-6 max-w-md text-center text-2xs leading-relaxed text-slate-500">
              Drag blocks from the left onto the canvas, click any block to edit it, then save it as
              a template when it is ready. Your draft is kept in this browser until you reset it.
            </p>
          </main>

          <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white xl:block xl:w-[384px]">
            <SettingsPanel />
          </aside>
        </div>
      </div>

      {restored ? (
        <ResumeDialog
          design={restored}
          open
          onContinue={() => setRestored(null)}
          onStartNew={() => void discard(null)}
        />
      ) : null}

      <DiscardDialog
        mode={discarding ?? 'empty'}
        open={discarding !== null}
        onCancel={() => setDiscarding(null)}
        onConfirm={() => void discard(discarding === 'new' ? null : EMPTY_DOC)}
      />
    </CraftEditor>
  );
}
