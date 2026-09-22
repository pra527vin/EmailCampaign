'use client';

import { useEditor, useNode } from '@craftjs/core';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import type { CSSProperties } from 'react';
import {
  AlignInput,
  ColorInput,
  Field,
  FontInput,
  NumberInput,
  TextInput,
  ToggleInput,
} from '@/components/compose/inputs';
import type { LinkTextProps } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: LinkTextProps = {
  text: 'View this in your browser',
  href: 'https://example.com',
  color: '#0E5AA7',
  fontSize: 14,
  fontFamily: '',
  underline: true,
  align: 'left',
  paddingY: 6,
};

/**
 * A standalone hyperlink -- "view in browser", a footer link, a policy line.
 *
 * As with the button, the anchor only exists in preview: while editing, the
 * same words are contenteditable so clicking them changes the text instead of
 * navigating away from the composer.
 */
export function LinkText(props: Partial<LinkTextProps>) {
  const { text, href, color, fontSize, underline, align, paddingY, fontFamily } = {
    ...DEFAULTS,
    ...props,
  };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));

  const style: CSSProperties = {
    color,
    fontSize,
    fontFamily: fontFamily || 'inherit',
    textDecoration: underline ? 'underline' : 'none',
  };

  return (
    <div style={{ padding: `${paddingY}px 0`, textAlign: align }}>
      {enabled ? (
        <ContentEditable
          innerRef={(el: HTMLElement | null) => {
            if (el) connect(drag(el));
          }}
          html={text}
          tagName="span"
          onChange={(event: ContentEditableEvent) =>
            setProp((p: LinkTextProps) => (p.text = event.target.value))
          }
          style={{ ...style, cursor: 'text' }}
        />
      ) : (
        <a
          ref={(el) => {
            if (el) connect(drag(el));
          }}
          href={href || undefined}
          target="_blank"
          rel="noopener noreferrer"
          style={style}
          // Authored here, and the same string the export writes.
          dangerouslySetInnerHTML={{ __html: text }}
        />
      )}
    </div>
  );
}

function LinkTextSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as LinkTextProps);

  return (
    <>
      <Field label="Link text">
        <TextInput value={p.text} onChange={(v) => setProp((n: LinkTextProps) => (n.text = v))} />
      </Field>
      <Field label="Link URL">
        <TextInput
          value={p.href}
          placeholder="https://example.com"
          onChange={(v) => setProp((n: LinkTextProps) => (n.href = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: LinkTextProps) => (n.align = v))} />
      </Field>
      <Field label="Font">
        <FontInput
          value={p.fontFamily}
          onChange={(v) => setProp((n: LinkTextProps) => (n.fontFamily = v))}
        />
      </Field>
      <Field label="Underline">
        <ToggleInput
          value={p.underline}
          onChange={(v) => setProp((n: LinkTextProps) => (n.underline = v))}
        />
      </Field>
      <Field label="Font size">
        <NumberInput
          value={p.fontSize}
          min={10}
          max={28}
          suffix="px"
          onChange={(v) => setProp((n: LinkTextProps) => (n.fontSize = v))}
        />
      </Field>
      <Field label="Color">
        <ColorInput value={p.color} onChange={(v) => setProp((n: LinkTextProps) => (n.color = v))} />
      </Field>
    </>
  );
}

LinkText.craft = {
  displayName: 'Link',
  props: DEFAULTS,
  related: { settings: LinkTextSettings },
};
