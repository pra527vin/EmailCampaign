'use client';

import { Element, useEditor } from '@craftjs/core';
import { useCallback, useEffect } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  Banner,
  BulletList,
  ButtonLink,
  DataTable,
  Divider,
  IconRow,
  ImageBlock,
  LinkText,
  Logo,
  Section,
  Spacer,
  Text,
} from '@/components/compose/blocks';
import { getActiveLogoLayerId, setActiveLogoLayerId } from '@/lib/compose/active-logo-layer';

/* -- Thumbnails ------------------------------------------------------------ */

/**
 * Each block is previewed by an abstract shape rather than an icon.
 *
 * A generic icon set would make "Text" and "Bullet list" look alike; a rough
 * picture of the block's own geometry is recognisable at a glance and needs no
 * label to be read.
 */
const BRAND = (alpha: number): string => `rgba(14,90,167,${alpha})`;
const INK = (alpha: number): string => `rgba(15,27,42,${alpha})`;

function Thumb({
  dashed,
  style,
  children,
}: {
  dashed?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className="h-6 w-[34px] flex-none rounded-[5px] bg-slate-100"
      style={{ border: dashed ? `1px dashed ${INK(0.2)}` : `1px solid ${INK(0.13)}`, ...style }}
    >
      {children}
    </span>
  );
}

const THUMBS: Record<string, ReactElement> = {
  banner: (
    <Thumb
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        padding: 3,
        gap: 2,
      }}
    >
      <span style={{ height: 8, borderRadius: 2, background: BRAND(0.55) }} />
      <span style={{ height: 2, width: '70%', borderRadius: 2, background: INK(0.22) }} />
    </Thumb>
  ),
  logo: (
    <Thumb style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span
        style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${BRAND(0.75)}` }}
      />
    </Thumb>
  ),
  section: (
    <Thumb style={{ display: 'flex', gap: 3, padding: 4 }}>
      <span style={{ flex: 1, borderRadius: 2, background: INK(0.2) }} />
      <span style={{ flex: 1, borderRadius: 2, background: INK(0.2) }} />
    </Thumb>
  ),
  divider: (
    <Thumb style={{ display: 'flex', alignItems: 'center', padding: '0 5px' }}>
      <span style={{ flex: 1, height: 1, background: INK(0.34) }} />
    </Thumb>
  ),
  spacer: <Thumb dashed />,
  text: (
    <Thumb
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
        padding: '0 5px',
      }}
    >
      <span style={{ height: 2, borderRadius: 2, background: INK(0.32) }} />
      <span style={{ height: 2, borderRadius: 2, background: INK(0.32) }} />
      <span style={{ height: 2, width: '60%', borderRadius: 2, background: INK(0.32) }} />
    </Thumb>
  ),
  button: (
    <Thumb style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 19, height: 9, borderRadius: 5, background: BRAND(0.7) }} />
    </Thumb>
  ),
  link: (
    <Thumb
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 7,
      }}
    >
      <span style={{ width: 16, height: 1.5, background: BRAND(0.8) }} />
    </Thumb>
  ),
  image: (
    <Thumb style={{ display: 'flex', alignItems: 'flex-end', padding: 3, gap: 2 }}>
      <span style={{ width: 8, height: 7, background: INK(0.24) }} />
      <span style={{ width: 10, height: 12, background: INK(0.18) }} />
      <span style={{ width: 6, height: 5, background: INK(0.24) }} />
    </Thumb>
  ),
  bullets: (
    <Thumb
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
        padding: '0 5px',
      }}
    >
      {[0, 1, 2].map((row) => (
        <span key={row} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ width: 2, height: 2, borderRadius: '50%', background: BRAND(0.8) }} />
          <span style={{ flex: 1, height: 2, background: INK(0.28) }} />
        </span>
      ))}
    </Thumb>
  ),
  table: (
    <Thumb
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 1,
        padding: 4,
      }}
    >
      <span style={{ background: INK(0.26) }} />
      <span style={{ background: INK(0.18) }} />
      <span style={{ background: INK(0.18) }} />
      <span style={{ background: INK(0.18) }} />
    </Thumb>
  ),
  social: (
    <Thumb style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      {[0, 1, 2].map((dot) => (
        <span key={dot} style={{ width: 5, height: 5, borderRadius: '50%', background: INK(0.3) }} />
      ))}
    </Thumb>
  ),
};

/* -- The catalogue --------------------------------------------------------- */

interface BlockItem {
  type: string;
  name: string;
  /** Single-key shortcut that inserts this block. */
  key: string;
  create: () => ReactElement;
}

export const BLOCK_GROUPS: ReadonlyArray<{ label: string; items: BlockItem[] }> = [
  {
    label: 'Branding',
    items: [
      { type: 'banner', name: 'Banner', key: 'b', create: () => <Banner /> },
      { type: 'logo', name: 'Logo', key: 'l', create: () => <Logo /> },
    ],
  },
  {
    label: 'Layout',
    items: [
      { type: 'section', name: 'Section', key: 's', create: () => <Element canvas is={Section} /> },
      { type: 'divider', name: 'Divider', key: 'd', create: () => <Divider /> },
      { type: 'spacer', name: 'Spacer', key: 'p', create: () => <Spacer /> },
    ],
  },
  {
    label: 'Content',
    items: [
      { type: 'text', name: 'Text', key: 't', create: () => <Text /> },
      { type: 'button', name: 'Button', key: 'u', create: () => <ButtonLink /> },
      { type: 'link', name: 'Link', key: 'k', create: () => <LinkText /> },
      { type: 'image', name: 'Image', key: 'i', create: () => <ImageBlock /> },
      { type: 'bullets', name: 'Bullet list', key: 'o', create: () => <BulletList /> },
      { type: 'table', name: 'Table', key: 'a', create: () => <DataTable /> },
      { type: 'social', name: 'Social icons', key: 'c', create: () => <IconRow /> },
    ],
  },
];

const BY_KEY = new Map<string, BlockItem>();
BLOCK_GROUPS.forEach((group) => group.items.forEach((item) => BY_KEY.set(item.key, item)));

/* -- The rail -------------------------------------------------------------- */

export function Toolbox() {
  const { connectors, actions, query, enabled } = useEditor((state) => ({
    enabled: state.options.enabled,
  }));

  /**
   * Where a click or keypress insert should land: inside the selected canvas,
   * immediately after the selected block, or at the end of the email body.
   *
   * Dropping everything at the end would be simpler and much worse -- adding a
   * block while working halfway down a long email would send it off-screen.
   */
  const dropTarget = useCallback((): { parentId: string; index: number | undefined } => {
    try {
      const selectedId = query.getEvent('selected').first();
      if (selectedId && query.node(selectedId).get()) {
        if (query.node(selectedId).isCanvas()) {
          return { parentId: selectedId, index: undefined };
        }
        const parentId = query.node(selectedId).get().data.parent;
        if (parentId && query.node(parentId).get()) {
          const siblings = query.node(parentId).get().data.nodes;
          return { parentId, index: siblings.indexOf(selectedId) + 1 };
        }
      }
    } catch {
      // A stale selection: fall through to the root canvas.
    }
    return { parentId: 'ROOT', index: undefined };
  }, [query]);

  const addBlock = useCallback(
    (create: () => ReactElement) => {
      const tree = query.parseReactElement(create()).toNodeTree();
      const { parentId, index } = dropTarget();
      actions.addNodeTree(tree, parentId, index);
      actions.selectNode(tree.rootNodeId);
    },
    [actions, query, dropTarget],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Never act behind an open overlay (export modal, reset dialog).
      if (document.querySelector('[role="dialog"]')) return;

      // Undo/redo work everywhere except inside a text field, which has its own
      // native undo that someone editing words expects to get instead.
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !inField && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) actions.history.redo();
        else actions.history.undo();
        return;
      }
      if (mod && !inField && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        actions.history.redo();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (inField) return;

      if (event.key === 'Escape') {
        actions.clearEvents();
        setActiveLogoLayerId(null);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // A logo layer being nudged by the arrow keys owns Delete too; its own
        // listener removes just that layer.
        if (getActiveLogoLayerId()) return;
        try {
          const selectedId = query.getEvent('selected').first();
          if (selectedId && query.node(selectedId).isDeletable()) {
            event.preventDefault();
            actions.delete(selectedId);
          }
        } catch {
          // A stale selection: nothing to delete.
        }
        return;
      }

      const item = BY_KEY.get(event.key.toLowerCase());
      if (!item) return;
      event.preventDefault();
      addBlock(item.create);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addBlock, actions, query, enabled]);

  return (
    <div className="flex min-h-full flex-col gap-[22px] px-4 pb-[34px] pt-5">
      <div className="flex flex-col gap-[5px] px-1">
        <span className="text-base font-bold text-slate-900">Blocks</span>
        <span className="text-2xs leading-relaxed text-slate-500">
          Drag a block onto the canvas, or press the key shown. Select one and press Delete to
          remove it.
        </span>
      </div>

      {BLOCK_GROUPS.map((group) => (
        <section key={group.label} className="flex flex-col gap-1">
          <h3 className="mx-1 mb-1.5 text-2xs font-bold uppercase tracking-[0.12em] text-slate-400">
            {group.label}
          </h3>
          {group.items.map((item) => (
            <button
              key={item.type}
              type="button"
              title={`Drag onto the canvas, or press ${item.key.toUpperCase()}`}
              ref={(el) => {
                if (el) connectors.create(el, item.create());
              }}
              onClick={() => addBlock(item.create)}
              className="flex cursor-grab items-center gap-[11px] rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-600 active:cursor-grabbing"
            >
              {THUMBS[item.type]}
              <span className="flex-1">{item.name}</span>
              <kbd className="rounded border border-slate-300 px-[5px] py-px text-[9.5px] text-slate-500">
                {item.key.toUpperCase()}
              </kbd>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
