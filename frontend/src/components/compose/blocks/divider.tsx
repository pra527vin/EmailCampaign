'use client';

import { useNode } from '@craftjs/core';
import { ColorInput, Field, NumberInput } from '@/components/compose/inputs';
import type { DividerProps, SpacerProps } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DIVIDER_DEFAULTS: DividerProps = { color: '#E3E8EE', thickness: 1, marginY: 16 };
const SPACER_DEFAULTS: SpacerProps = { height: 24 };

/** A horizontal rule with its own vertical breathing room. */
export function Divider(props: Partial<DividerProps>) {
  const { color, thickness, marginY } = { ...DIVIDER_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      style={{ padding: `${marginY}px 0` }}
    >
      <hr style={{ border: 'none', borderTop: `${thickness}px solid ${color}`, margin: 0 }} />
    </div>
  );
}

function DividerSettings() {
  const {
    color,
    thickness,
    marginY,
    actions: { setProp },
  } = useNode((node) => node.data.props as DividerProps);

  return (
    <>
      <Field label="Color">
        <ColorInput value={color} onChange={(v) => setProp((p: DividerProps) => (p.color = v))} />
      </Field>
      <Field label="Thickness">
        <NumberInput
          value={thickness}
          min={1}
          max={12}
          suffix="px"
          onChange={(v) => setProp((p: DividerProps) => (p.thickness = v))}
        />
      </Field>
      <Field label="Vertical spacing">
        <NumberInput
          value={marginY}
          max={60}
          suffix="px"
          onChange={(v) => setProp((p: DividerProps) => (p.marginY = v))}
        />
      </Field>
    </>
  );
}

Divider.craft = {
  displayName: 'Divider',
  props: DIVIDER_DEFAULTS,
  related: { settings: DividerSettings },
};

/**
 * Empty vertical space.
 *
 * The dashed line only exists on the canvas -- the exported spacer is an empty
 * table row, so nothing of this marker reaches the email.
 */
export function Spacer(props: Partial<SpacerProps>) {
  const { height } = { ...SPACER_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      style={{ height }}
      className="relative flex items-center justify-center"
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-300" />
    </div>
  );
}

function SpacerSettings() {
  const {
    height,
    actions: { setProp },
  } = useNode((node) => node.data.props as SpacerProps);

  return (
    <Field label="Height">
      <NumberInput
        value={height}
        max={160}
        suffix="px"
        onChange={(v) => setProp((p: SpacerProps) => (p.height = v))}
      />
    </Field>
  );
}

Spacer.craft = {
  displayName: 'Spacer',
  props: SPACER_DEFAULTS,
  related: { settings: SpacerSettings },
};
