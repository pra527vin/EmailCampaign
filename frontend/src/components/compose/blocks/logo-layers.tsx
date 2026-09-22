'use client';

import { ArrowDown, ArrowUp, BadgeCheck, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { HtmlDisclosure } from '@/components/compose/html-disclosure';
import { HtmlImage } from '@/components/compose/html-image';
import {
  BTN_DASHED,
  BTN_ICON,
  CARD,
  Field,
  HINT,
  ImageSourceInput,
  NumberInput,
  SECTION_TITLE,
  TextInput,
} from '@/components/compose/inputs';
import { useResolvedImage } from '@/components/compose/use-resolved-image';
import {
  getActiveLogoLayerId,
  setActiveLogoLayerId,
  subscribeActiveLogoLayerId,
} from '@/lib/compose/active-logo-layer';
import {
  logoLayerBoxStyle,
  logoLayerHtml,
  logoLayerInnerHtml,
  logoLayerProps,
} from '@/lib/compose/logo-layer-html';
import type { LogoLayer } from '@/lib/compose/types';

export const newLogoLayer = (overrides: Partial<LogoLayer> = {}): LogoLayer => ({
  id: `logo-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
  src: '',
  alt: '',
  width: 22,
  x: 50,
  y: 50,
  opacity: 1,
  href: '',
  ...overrides,
});

const PLACEHOLDER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 34,
  padding: '6px 8px',
  border: '1px dashed rgba(148,148,148,.9)',
  borderRadius: 4,
  background: 'rgba(255,255,255,.14)',
  font: "600 10px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: '#6B7B8C',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

/**
 * One positioned logo.
 *
 * Its image is resolved per layer -- the link first, then the same link
 * through this app's server if the host refuses the browser -- so one
 * half-typed or blocked URL never leaves the other layers stuck.
 */
function Layer({
  layer,
  enabled,
  dragging,
  active,
  onStart,
  asHtml,
}: {
  layer: LogoLayer;
  enabled: boolean;
  dragging: boolean;
  active: boolean;
  onStart: (id: string) => void;
  asHtml: boolean;
}) {
  const { status, imgProps, imgKey, resolved } = useResolvedImage(layer.src);

  const failed = status === 'error';
  const blank = !layer.src;

  // Preview and export only ever show real artwork; the placeholder is an
  // editing affordance, not part of the email.
  if ((blank || failed) && !enabled) return null;

  const label = blank
    ? 'Logo - add an image'
    : failed
      ? 'Logo - image failed'
      : 'Logo - loading...';

  let img = null;
  if (layer.src && asHtml) {
    // Exactly what the email carries, only pointed at a copy of the picture
    // the browser is allowed to load.
    img = (
      <div
        style={{ display: failed ? 'none' : 'block', pointerEvents: 'none', userSelect: 'none' }}
      >
        <HtmlImage
          html={logoLayerInnerHtml(layer, { srcOverride: resolved })}
          onLoad={imgProps.onLoad as () => void}
          onError={imgProps.onError as () => void}
        />
      </div>
    );
  } else if (layer.src) {
    img = (
      // A plain <img>, not next/image: the source is an arbitrary remote URL
      // (sometimes proxied through this app), which the optimiser cannot take.
      <img
        key={imgKey}
        {...imgProps}
        alt={layer.alt || ''}
        draggable={false}
        style={{
          width: '100%',
          display: failed ? 'none' : 'block',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
    );
  }

  const body = (
    <>
      {img}
      {enabled && status !== 'ok' ? <span style={PLACEHOLDER_STYLE}>{label}</span> : null}
    </>
  );

  return (
    <div
      data-logo-layer={layer.id}
      title={enabled ? 'Click to select, then use the arrow keys to move it' : undefined}
      onMouseDown={(event) => {
        if (!enabled) return;
        event.stopPropagation();
        event.preventDefault();
        onStart(layer.id);
      }}
      onTouchStart={(event) => {
        if (!enabled) return;
        event.stopPropagation();
        onStart(layer.id);
      }}
      style={{
        ...logoLayerBoxStyle(layer),
        minWidth: status === 'ok' ? undefined : 120,
        cursor: enabled ? (dragging ? 'grabbing' : 'grab') : layer.href ? 'pointer' : 'default',
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    >
      {!enabled && layer.href ? (
        <a href={layer.href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
          {body}
        </a>
      ) : (
        body
      )}
      {enabled && status === 'ok' ? (
        <span
          className={
            active
              ? 'pointer-events-none absolute inset-0 rounded outline outline-2 outline-offset-2 outline-brand-600'
              : 'pointer-events-none absolute inset-0 rounded outline-dashed outline-1 outline-white/70'
          }
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

/**
 * Logo layers floating above a banner or image.
 *
 * Drag one to position it anywhere inside the block. Positions are stored as
 * percentages, so they survive the 600px/375px switch and the export unchanged
 * -- a layer placed over someone's face stays over their face at every width.
 */
export function LogoLayers({
  layers = [],
  enabled,
  onUpdate,
  onRemove,
  asHtml = false,
}: {
  layers: LogoLayer[];
  enabled: boolean;
  onUpdate: (id: string, patch: Partial<LogoLayer>) => void;
  onRemove: (id: string) => void;
  asHtml?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(getActiveLogoLayerId);

  useEffect(() => subscribeActiveLogoLayerId(setActiveId), []);

  const select = useCallback((id: string) => {
    // Claiming a layer calls preventDefault() on its mousedown, which also
    // blocks the browser's usual focus change. Without this blur a text block
    // being edited stays focused, and the arrow keys or Delete would edit that
    // text rather than move the layer.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    setDraggingId(id);
    setActiveLogoLayerId(id);
  }, []);

  const onPointerMove = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!draggingId || !boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const point = 'touches' in event ? event.touches[0] : event;
      if (!point) return;

      const x = Math.max(0, Math.min(100, ((point.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((point.clientY - rect.top) / rect.height) * 100));
      onUpdate(draggingId, { x, y });
    },
    [draggingId, onUpdate],
  );

  const stop = useCallback(() => setDraggingId(null), []);

  useEffect(() => {
    if (!draggingId) return undefined;
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', stop);
    };
  }, [draggingId, onPointerMove, stop]);

  // A layer removed from the settings panel, or undone, must not leave a
  // phantom id still claiming the arrow keys.
  useEffect(() => {
    if (activeId && !layers.some((layer) => layer.id === activeId)) setActiveLogoLayerId(null);
  }, [layers, activeId]);

  // Clicking anywhere that is not a layer releases the selection, so the arrow
  // keys stop moving a logo the person has clicked away from.
  useEffect(() => {
    if (!enabled || !activeId) return undefined;
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-logo-layer]')) {
        setActiveLogoLayerId(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [enabled, activeId]);

  const isActiveMine = Boolean(activeId) && layers.some((layer) => layer.id === activeId);

  useEffect(() => {
    if (!enabled || !isActiveMine || !activeId) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      // Never steal a key from something being typed into, or from a dialog.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      const step = event.shiftKey ? 5 : 1;
      const deltas: Record<string, { x?: number; y?: number }> = {
        ArrowUp: { y: -step },
        ArrowDown: { y: step },
        ArrowLeft: { x: -step },
        ArrowRight: { x: step },
      };

      const delta = deltas[event.key];
      if (delta) {
        event.preventDefault();
        const layer = layers.find((item) => item.id === activeId);
        if (!layer) return;
        onUpdate(activeId, {
          x: Math.max(0, Math.min(100, layer.x + (delta.x ?? 0))),
          y: Math.max(0, Math.min(100, layer.y + (delta.y ?? 0))),
        });
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        onRemove(activeId);
        setActiveLogoLayerId(null);
      } else if (event.key === 'Escape') {
        setActiveLogoLayerId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, isActiveMine, activeId, layers, onUpdate, onRemove]);

  if (!layers.length) return null;

  return (
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {layers.map((layer) => (
        <Layer
          key={layer.id}
          layer={layer}
          enabled={enabled}
          asHtml={asHtml}
          dragging={draggingId === layer.id}
          active={activeId === layer.id}
          onStart={select}
        />
      ))}
    </div>
  );
}

/** The "Logo layers" section shared by the Banner and Image settings panels. */
export function LogoLayerFields({
  layers = [],
  setLayers,
  showHtml = false,
}: {
  layers: LogoLayer[];
  /** Runs against craft's draft array, so mutation is the intended style. */
  setLayers: (mutate: (list: LogoLayer[]) => void) => void;
  showHtml?: boolean;
}) {
  const add = (): void =>
    setLayers((list) => {
      list.push(newLogoLayer({ y: layers.length ? 50 : 30 }));
    });

  const update = (id: string, patch: Partial<LogoLayer>): void =>
    setLayers((list) => {
      const index = list.findIndex((layer) => layer.id === id);
      if (index > -1) list[index] = { ...(list[index] as LogoLayer), ...patch };
    });

  const remove = (id: string): void =>
    setLayers((list) => {
      const index = list.findIndex((layer) => layer.id === id);
      if (index > -1) list.splice(index, 1);
    });

  const move = (id: string, direction: -1 | 1): void =>
    setLayers((list) => {
      const index = list.findIndex((layer) => layer.id === id);
      const swap = index + direction;
      if (index < 0 || swap < 0 || swap >= list.length) return;
      const held = list[index] as LogoLayer;
      list[index] = list[swap] as LogoLayer;
      list[swap] = held;
    });

  return (
    <div className="mb-[18px] border-t border-slate-200 pt-[18px]">
      <p className={`mb-2.5 ${SECTION_TITLE}`}>Logo layers</p>
      <p className={`mb-2.5 ${HINT}`}>
        Drag one on the canvas to position it, or click it and nudge with the arrow keys (hold Shift
        to move faster). Delete removes whichever one is selected.
      </p>

      <div className="space-y-3">
        {layers.map((layer, index) => (
          <div key={layer.id} className={`space-y-2.5 ${CARD}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <BadgeCheck size={13} /> Logo {index + 1}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Send backward"
                  onClick={() => move(layer.id, -1)}
                  className={BTN_ICON}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  title="Bring forward"
                  onClick={() => move(layer.id, 1)}
                  className={BTN_ICON}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  title="Remove layer"
                  onClick={() => remove(layer.id)}
                  className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <ImageSourceInput
              value={layer.src}
              placeholder="Logo PNG / SVG URL"
              onChange={(v) => update(layer.id, { src: v })}
            />
            {!layer.src ? (
              <p className={HINT}>
                Paste a link straight to the image file, or upload one. Until then the layer shows as
                a dashed placeholder on the canvas that you can already drag into place.
              </p>
            ) : null}

            {showHtml ? (
              <Field
                label="Alt text"
                hint="Shown by mail clients that block images until the reader allows them."
              >
                <TextInput
                  value={layer.alt}
                  placeholder="Your logo"
                  onChange={(v) => update(layer.id, { alt: v })}
                />
              </Field>
            ) : null}

            <Field label="Link URL (optional)">
              <TextInput
                value={layer.href}
                placeholder="https://example.com"
                onChange={(v) => update(layer.id, { href: v })}
              />
            </Field>
            <Field label="Width">
              <NumberInput
                value={layer.width}
                min={4}
                max={90}
                suffix="%"
                onChange={(v) => update(layer.id, { width: v })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X position">
                <NumberInput
                  compact
                  value={Math.round(layer.x)}
                  max={100}
                  suffix="%"
                  onChange={(v) => update(layer.id, { x: v })}
                />
              </Field>
              <Field label="Y position">
                <NumberInput
                  compact
                  value={Math.round(layer.y)}
                  max={100}
                  suffix="%"
                  onChange={(v) => update(layer.id, { y: v })}
                />
              </Field>
            </div>
            <Field label="Opacity">
              <NumberInput
                value={Math.round(layer.opacity * 100)}
                max={100}
                suffix="%"
                onChange={(v) => update(layer.id, { opacity: v / 100 })}
              />
            </Field>

            {showHtml && layer.src ? <LayerHtml layer={layer} /> : null}
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className={`mt-2.5 ${BTN_DASHED}`}>
        <Plus size={13} /> Add logo layer
      </button>

      {layers.length ? (
        <p className={`mt-2.5 ${HINT}`}>
          Layered logos render in Gmail, Apple Mail and most webmail. Older desktop Outlook shows the
          block without the layers, so keep anything essential in the block itself.
        </p>
      ) : null}
    </div>
  );
}

function LayerHtml({ layer }: { layer: LogoLayer }) {
  const p = logoLayerProps(layer);

  return (
    <div className="border-t border-slate-200 pt-2.5">
      <HtmlDisclosure
        html={logoLayerHtml(layer)}
        facts={[
          { label: 'Source', value: p.src, truncate: true },
          { label: 'Alt text', value: p.alt || '(none)' },
          { label: 'Width', value: `${p.width}% — ${p.pixelWidth}px in a 600px email` },
          {
            label: 'Position',
            value: `${Math.round(p.x)}% across, ${Math.round(p.y)}% down (centre)`,
          },
          { label: 'Opacity', value: `${Math.round(p.opacity * 100)}%` },
          { label: 'Link', value: p.href || '(none)', truncate: true },
        ]}
        note="This is what the block sends. The canvas draws the same markup inside a draggable box, which is where the position sits while you edit."
      />
    </div>
  );
}
