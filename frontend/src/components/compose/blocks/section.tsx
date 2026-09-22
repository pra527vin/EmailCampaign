'use client';

import { useEditor, useNode } from '@craftjs/core';
import { Children } from 'react';
import type { ReactNode } from 'react';
import {
  BackgroundInput,
  ColorInput,
  Field,
  NumberInput,
  SelectInput,
} from '@/components/compose/inputs';
import { sectionBorderStyle } from '@/lib/compose/section-border';
import type { SectionBorderStyle, SectionProps } from '@/lib/compose/types';

/**
 * The block's defaults, in one place.
 *
 * craft.js instantiates a block with no props and fills them from
 * `craft.props`, so every block component has to accept a partial set.
 * Merging the same constant craft registers keeps the two from ever
 * disagreeing, and means a default is written once rather than twice.
 */
const DEFAULTS: SectionProps = {
  background: '#FFFFFF',
  paddingTop: 24,
  paddingBottom: 24,
  paddingX: 24,
  borderTop: 0,
  borderWidth: 0,
  borderStyle: 'solid',
  borderColor: '#E3E8EE',
  borderRadius: 0,
};

/**
 * A droppable row -- the only block that holds other blocks.
 *
 * Rendered as a table rather than a div because that is what the exported
 * email uses, and a canvas built from different primitives would drift from
 * the output it is meant to preview.
 */
export function Section(props: Partial<SectionProps> & { children?: ReactNode }) {
  const resolved = { ...DEFAULTS, ...props };
  const { background, paddingTop, paddingBottom, paddingX, children } = resolved;
  const {
    connectors: { connect, drag },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const empty = Children.count(children) === 0;

  return (
    <table
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ background, ...sectionBorderStyle(resolved) }}
    >
      <tbody>
        <tr>
          <td
            style={{
              paddingTop,
              paddingBottom,
              paddingLeft: paddingX,
              paddingRight: paddingX,
            }}
          >
            {/* A minimum height keeps an empty section a drop target rather
                than a zero-pixel line nothing can be aimed at. It applies only
                while the section is empty, because the exported email has no
                such floor and a section holding one short block would
                otherwise stand taller here than in the inbox. */}
            <div style={enabled && empty ? { minHeight: 24 } : undefined}>
              {children}
              {enabled && empty ? (
                <div
                  style={{
                    pointerEvents: 'none',
                    padding: '30px 18px',
                    border: '1px dashed #D6DEE7',
                    borderRadius: 8,
                    textAlign: 'center',
                    font: "600 11px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
                    letterSpacing: '0.04em',
                    color: '#6B7B8C',
                  }}
                >
                  Drop a block here
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function SectionSettings() {
  const {
    background,
    paddingTop,
    paddingBottom,
    paddingX,
    borderTop,
    borderWidth,
    borderStyle,
    borderColor,
    borderRadius,
    actions: { setProp },
  } = useNode((node) => ({ ...DEFAULTS, ...(node.data.props as Partial<SectionProps>) }));

  const hasBorder = borderWidth > 0 || borderTop > 0;

  return (
    <>
      <Field label="Background color">
        <BackgroundInput
          value={background}
          onChange={(v) => setProp((p: SectionProps) => (p.background = v))}
        />
      </Field>
      <Field label="Top padding">
        <NumberInput
          value={paddingTop}
          max={100}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.paddingTop = v))}
        />
      </Field>
      <Field label="Bottom padding">
        <NumberInput
          value={paddingBottom}
          max={100}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.paddingBottom = v))}
        />
      </Field>
      <Field label="Side padding">
        <NumberInput
          value={paddingX}
          max={100}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.paddingX = v))}
        />
      </Field>
      <Field label="Border" hint="A box around the whole section.">
        <NumberInput
          value={borderWidth}
          max={12}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.borderWidth = v))}
        />
      </Field>
      <Field label="Top rule" hint="A line above the section, for separating one band from the next.">
        <NumberInput
          value={borderTop}
          max={12}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.borderTop = v))}
        />
      </Field>
      <Field
        label="Corner radius"
        hint="Outlook on Windows draws square corners whatever this says, so the design should still read without them."
      >
        <NumberInput
          value={borderRadius}
          max={40}
          suffix="px"
          onChange={(v) => setProp((p: SectionProps) => (p.borderRadius = v))}
        />
      </Field>
      {hasBorder ? (
        <>
          <Field label="Line style">
            <SelectInput<SectionBorderStyle>
              value={borderStyle}
              onChange={(v) => setProp((p: SectionProps) => (p.borderStyle = v))}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
            />
          </Field>
          <Field label="Border color">
            <ColorInput
              value={borderColor}
              onChange={(v) => setProp((p: SectionProps) => (p.borderColor = v))}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}

Section.craft = {
  displayName: 'Section',
  props: DEFAULTS,
  related: { settings: SectionSettings },
};
