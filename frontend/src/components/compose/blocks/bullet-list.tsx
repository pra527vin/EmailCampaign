'use client';

import { useEditor, useNode } from '@craftjs/core';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import {
  ColorInput,
  Field,
  HINT,
  NumberInput,
  SelectInput,
  TextInput,
} from '@/components/compose/inputs';
import { markerFor } from '@/lib/compose/bullet-markers';
import type { BulletListProps, BulletMarkerType } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: BulletListProps = {
  items: [
    { id: 'item-1', text: 'A benefit worth leading with' },
    { id: 'item-2', text: 'Something that answers an objection' },
    { id: 'item-3', text: 'A detail that makes it feel real' },
  ],
  markerType: 'bullet',
  customMarker: '→',
  markerColor: '#0E5AA7',
  textColor: '#0F1B2A',
  fontSize: 15,
  lineHeight: 1.6,
  itemSpacing: 10,
  markerWidth: 20,
};

/**
 * A list, built as a two-column table.
 *
 * Mail clients indent and style real `<ul>` markers inconsistently, and some
 * drop them entirely, so the marker is drawn as text in its own cell. That
 * makes the glyph and the indent ours rather than the client's.
 *
 * Points are edited in place: the settings panel governs how the list looks,
 * the canvas governs what it says.
 */
export function BulletList(props: Partial<BulletListProps>) {
  const {
    items,
    markerType,
    customMarker,
    markerColor,
    textColor,
    fontSize,
    lineHeight,
    itemSpacing,
    markerWidth,
  } = { ...DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const [hovered, setHovered] = useState<string | null>(null);

  const updateItem = (id: string, text: string): void =>
    setProp((p: BulletListProps) => {
      const item = p.items.find((entry) => entry.id === id);
      if (item) item.text = text;
    });

  const addItem = (): void =>
    setProp((p: BulletListProps) => {
      p.items.push({ id: `item-${Date.now()}`, text: 'New point' });
    });

  // The last point is never removable: an empty list would leave nothing to
  // click back into.
  const removeItem = (id: string): void =>
    setProp((p: BulletListProps) => {
      if (p.items.length > 1) p.items = p.items.filter((entry) => entry.id !== id);
    });

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
    >
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.id}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered((current) => (current === item.id ? null : current))}
            >
              <td
                valign="top"
                style={{
                  width: markerWidth,
                  color: markerColor,
                  fontSize,
                  lineHeight,
                  paddingBottom: itemSpacing,
                  fontWeight: 600,
                }}
              >
                {markerFor(markerType, index, customMarker)}
              </td>
              <td valign="top" style={{ paddingBottom: itemSpacing, position: 'relative' }}>
                <ContentEditable
                  html={item.text}
                  tagName="span"
                  onChange={(event: ContentEditableEvent) => updateItem(item.id, event.target.value)}
                  style={{ color: textColor, fontSize, lineHeight, display: 'inline-block' }}
                />
                {enabled && hovered === item.id && items.length > 1 ? (
                  <button
                    type="button"
                    contentEditable={false}
                    aria-label="Remove this point"
                    onClick={() => removeItem(item.id)}
                    className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-red-50 align-middle text-red-600 hover:bg-red-100"
                  >
                    <Trash2 size={11} />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {enabled ? (
        <button
          type="button"
          contentEditable={false}
          onClick={addItem}
          className="mt-1.5 flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-2xs font-semibold text-slate-500 hover:border-brand-600 hover:text-brand-700"
        >
          <Plus size={12} /> Add point
        </button>
      ) : null}
    </div>
  );
}

function BulletListSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as BulletListProps);

  return (
    <>
      <Field label="Marker style">
        <SelectInput<BulletMarkerType>
          value={p.markerType}
          onChange={(v) => setProp((n: BulletListProps) => (n.markerType = v))}
          options={[
            { value: 'bullet', label: 'Bullet (•)' },
            { value: 'number', label: 'Numbered' },
            { value: 'check', label: 'Checkmark' },
            { value: 'arrow', label: 'Arrow' },
            { value: 'custom', label: 'Custom character' },
          ]}
        />
      </Field>
      {p.markerType === 'custom' ? (
        <Field label="Custom marker">
          <TextInput
            value={p.customMarker}
            onChange={(v) => setProp((n: BulletListProps) => (n.customMarker = v))}
          />
        </Field>
      ) : null}
      <Field label="Marker color">
        <ColorInput
          value={p.markerColor}
          onChange={(v) => setProp((n: BulletListProps) => (n.markerColor = v))}
        />
      </Field>
      <Field label="Text color">
        <ColorInput
          value={p.textColor}
          onChange={(v) => setProp((n: BulletListProps) => (n.textColor = v))}
        />
      </Field>
      <Field label="Font size">
        <NumberInput
          value={p.fontSize}
          min={10}
          max={28}
          suffix="px"
          onChange={(v) => setProp((n: BulletListProps) => (n.fontSize = v))}
        />
      </Field>
      <Field label="Line height">
        <NumberInput
          value={p.lineHeight}
          min={1}
          max={2.4}
          step={0.1}
          onChange={(v) => setProp((n: BulletListProps) => (n.lineHeight = v))}
        />
      </Field>
      <Field label="Spacing between points">
        <NumberInput
          value={p.itemSpacing}
          max={40}
          suffix="px"
          onChange={(v) => setProp((n: BulletListProps) => (n.itemSpacing = v))}
        />
      </Field>
      <Field label="Marker column width">
        <NumberInput
          value={p.markerWidth}
          min={12}
          max={60}
          suffix="px"
          onChange={(v) => setProp((n: BulletListProps) => (n.markerWidth = v))}
        />
      </Field>
      <p className={HINT}>
        Edit points directly on the canvas &mdash; hover a point to delete it, or use &ldquo;Add
        point&rdquo; below the list.
      </p>
    </>
  );
}

BulletList.craft = {
  displayName: 'Bullet List',
  props: DEFAULTS,
  related: { settings: BulletListSettings },
};
