'use client';

import { useEditor, useNode } from '@craftjs/core';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import type { CSSProperties } from 'react';
import {
  AlignInput,
  BackgroundInput,
  ColorInput,
  Field,
  FontInput,
  NumberInput,
  TextInput,
} from '@/components/compose/inputs';
import type { ButtonLinkProps } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: ButtonLinkProps = {
  text: 'Shop the collection',
  href: 'https://example.com',
  background: '#0E5AA7',
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: 600,
  fontFamily: '',
  borderRadius: 8,
  paddingX: 28,
  paddingY: 14,
  paddingWrapperY: 8,
  align: 'center',
  fullWidth: false,
};

/**
 * A call to action, built as nested tables.
 *
 * A styled `<a>` would be simpler but Outlook ignores padding on inline
 * elements, so the clickable area collapses to the text. The table cell
 * carries the background and the padding instead, which every client honours.
 *
 * While editing, the label is contenteditable and the anchor is dropped --
 * otherwise clicking to change the words would follow the link instead.
 */
export function ButtonLink(props: Partial<ButtonLinkProps>) {
  const {
    text,
    href,
    background,
    color,
    fontSize,
    fontWeight,
    borderRadius,
    paddingX,
    paddingY,
    align,
    paddingWrapperY,
    fullWidth,
    fontFamily,
  } = { ...DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));

  const labelStyle: CSSProperties = {
    display: 'inline-block',
    padding: `${paddingY}px ${paddingX}px`,
    color,
    fontSize,
    fontWeight,
    fontFamily: fontFamily || 'inherit',
    textDecoration: 'none',
  };

  const margin = align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0';

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
      style={{ padding: `${paddingWrapperY}px 0` }}
    >
      <tbody>
        <tr>
          <td style={{ textAlign: align }}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              style={{ margin, width: fullWidth ? '100%' : undefined }}
            >
              <tbody>
                <tr>
                  <td style={{ background, borderRadius, textAlign: 'center' }}>
                    {enabled ? (
                      <ContentEditable
                        html={text}
                        tagName="span"
                        onChange={(event: ContentEditableEvent) =>
                          setProp((p: ButtonLinkProps) => (p.text = event.target.value))
                        }
                        style={{ ...labelStyle, cursor: 'text' }}
                      />
                    ) : (
                      <a
                        href={href || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={labelStyle}
                        // The label is authored in this editor, not supplied by
                        // a recipient, and it is the same string the export
                        // writes into the email.
                        dangerouslySetInnerHTML={{ __html: text }}
                      />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ButtonSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as ButtonLinkProps);

  return (
    <>
      <Field label="Button text">
        <TextInput value={p.text} onChange={(v) => setProp((n: ButtonLinkProps) => (n.text = v))} />
      </Field>
      <Field
        label="Link URL"
        hint="Opens when the button is clicked in preview and in the sent email."
      >
        <TextInput
          value={p.href}
          placeholder="https://example.com"
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.href = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: ButtonLinkProps) => (n.align = v))} />
      </Field>
      <Field label="Font">
        <FontInput
          value={p.fontFamily}
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.fontFamily = v))}
        />
      </Field>
      <Field label="Background color">
        <BackgroundInput
          value={p.background}
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.background = v))}
        />
      </Field>
      <Field label="Text color">
        <ColorInput value={p.color} onChange={(v) => setProp((n: ButtonLinkProps) => (n.color = v))} />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={p.borderRadius}
          max={40}
          suffix="px"
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.borderRadius = v))}
        />
      </Field>
      <Field label="Font size">
        <NumberInput
          value={p.fontSize}
          min={10}
          max={28}
          suffix="px"
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.fontSize = v))}
        />
      </Field>
      <Field label="Horizontal padding">
        <NumberInput
          value={p.paddingX}
          max={64}
          suffix="px"
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.paddingX = v))}
        />
      </Field>
      <Field label="Vertical padding">
        <NumberInput
          value={p.paddingY}
          max={40}
          suffix="px"
          onChange={(v) => setProp((n: ButtonLinkProps) => (n.paddingY = v))}
        />
      </Field>
    </>
  );
}

ButtonLink.craft = {
  displayName: 'Button',
  props: DEFAULTS,
  related: { settings: ButtonSettings },
};
