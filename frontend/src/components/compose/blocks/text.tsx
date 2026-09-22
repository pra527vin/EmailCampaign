'use client';

import { useEditor, useNode } from '@craftjs/core';
import { Link2, Link2Off } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import {
  AlignInput,
  BTN_GHOST,
  BTN_PRIMARY,
  ColorInput,
  Field,
  FontInput,
  HINT,
  NumberInput,
  SECTION_TITLE,
  SelectInput,
  TextInput,
  ToggleInput,
} from '@/components/compose/inputs';
import {
  applyInlineLink,
  forgetSelection,
  rememberSelection,
  removeInlineLink,
  selectionInfo,
} from '@/lib/compose/inline-link';
import type { TextProps, TextTag } from '@/lib/compose/types';

/** Each preset carries the size and weight that go with the tag. */
const PRESETS: Record<TextTag, { fontSize: number; fontWeight: number }> = {
  h1: { fontSize: 30, fontWeight: 700 },
  h2: { fontSize: 22, fontWeight: 700 },
  h3: { fontSize: 18, fontWeight: 600 },
  p: { fontSize: 15, fontWeight: 400 },
  small: { fontSize: 12, fontWeight: 400 },
};

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: TextProps = {
  text: 'Add your message here. Click to edit this text directly on the canvas.',
  tag: 'p',
  fontSize: 15,
  fontWeight: 400,
  fontFamily: '',
  color: '#0F1B2A',
  align: 'left',
  lineHeight: 1.6,
  paddingY: 8,
  href: '',
  linkColor: '#0E5AA7',
  linkUnderline: true,
};

export function Text(props: Partial<TextProps>) {
  const { text, tag, fontSize, fontWeight, fontFamily, color, align, lineHeight, paddingY, href } =
    { ...DEFAULTS, ...props };
  const {
    id,
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const elRef = useRef<HTMLElement | null>(null);

  /**
   * Keep the block's last text selection.
   *
   * Clicking into the settings panel collapses the selection, so by the time
   * "Link selected text" is pressed there is nothing selected to wrap. Holding
   * the last range is what makes that button work at all.
   */
  useEffect(() => {
    if (!enabled) return undefined;
    const onSelectionChange = () => rememberSelection(id, elRef.current);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [id, enabled]);

  useEffect(() => () => forgetSelection(id), [id]);

  const body = (
    <ContentEditable
      innerRef={(el: HTMLElement | null) => {
        elRef.current = el;
        if (el) connect(drag(el));
      }}
      html={text}
      tagName={tag}
      disabled={!enabled}
      onChange={(event: ContentEditableEvent) =>
        setProp((p: TextProps) => (p.text = event.target.value))
      }
      style={{
        margin: 0,
        fontSize,
        fontWeight,
        color,
        lineHeight,
        fontFamily: fontFamily || 'inherit',
      }}
    />
  );

  return (
    <div style={{ padding: `${paddingY}px 0`, textAlign: align }}>
      {!enabled && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

function TextSettings() {
  const {
    id,
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as TextProps);

  const [linkUrl, setLinkUrl] = useState('');
  const [note, setNote] = useState('');

  // Read on mousedown, before the click moves focus and collapses the
  // selection the button is about to act on.
  const pickUpSelection = (): void => {
    const info = selectionInfo(id);
    if (info.href) setLinkUrl(info.href);
    setNote(
      info.hasSelection
        ? `Selected: "${info.text.slice(0, 40)}${info.text.length > 40 ? '…' : ''}"`
        : '',
    );
  };

  const applyLink = (): void => {
    const info = selectionInfo(id);
    if (!info.hasSelection) {
      setNote('Select the words you want to link on the canvas first.');
      return;
    }
    if (!linkUrl.trim()) {
      setNote('Add a URL to link to.');
      return;
    }

    const html = applyInlineLink(id, linkUrl.trim(), {
      color: p.linkColor,
      underline: p.linkUnderline,
    });
    if (html === null) {
      setNote('Select the words you want to link on the canvas first.');
      return;
    }

    setProp((n: TextProps) => (n.text = html));
    setNote('Link applied.');
  };

  const clearLink = (): void => {
    const html = removeInlineLink(id);
    if (html === null) {
      setNote('Put the cursor inside the link you want to remove.');
      return;
    }
    setProp((n: TextProps) => (n.text = html));
    setNote('Link removed.');
  };

  return (
    <>
      <Field label="Style preset">
        <SelectInput<TextTag>
          value={p.tag}
          onChange={(v) =>
            setProp((n: TextProps) => {
              n.tag = v;
              n.fontSize = PRESETS[v].fontSize;
              n.fontWeight = PRESETS[v].fontWeight;
            })
          }
          options={[
            { value: 'h1', label: 'Heading 1' },
            { value: 'h2', label: 'Heading 2' },
            { value: 'h3', label: 'Heading 3' },
            { value: 'p', label: 'Paragraph' },
            { value: 'small', label: 'Small print' },
          ]}
        />
      </Field>
      <Field label="Font">
        <FontInput
          value={p.fontFamily}
          onChange={(v) => setProp((n: TextProps) => (n.fontFamily = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: TextProps) => (n.align = v))} />
      </Field>
      <Field label="Font size">
        <NumberInput
          value={p.fontSize}
          min={10}
          max={48}
          suffix="px"
          onChange={(v) => setProp((n: TextProps) => (n.fontSize = v))}
        />
      </Field>
      <Field label="Line height">
        <NumberInput
          value={p.lineHeight}
          min={1}
          max={2.4}
          step={0.1}
          onChange={(v) => setProp((n: TextProps) => (n.lineHeight = v))}
        />
      </Field>
      <Field label="Weight">
        <SelectInput
          value={String(p.fontWeight)}
          onChange={(v) => setProp((n: TextProps) => (n.fontWeight = Number(v)))}
          options={[
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Medium' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Bold' },
          ]}
        />
      </Field>
      <Field label="Text color">
        <ColorInput value={p.color} onChange={(v) => setProp((n: TextProps) => (n.color = v))} />
      </Field>
      <Field label="Vertical spacing">
        <NumberInput
          value={p.paddingY}
          max={60}
          suffix="px"
          onChange={(v) => setProp((n: TextProps) => (n.paddingY = v))}
        />
      </Field>

      <div className="mb-[18px] space-y-2.5 border-t border-slate-200 pt-[18px]">
        <p className={SECTION_TITLE}>Hyperlink</p>

        <TextInput value={linkUrl} placeholder="https://example.com" onChange={setLinkUrl} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={pickUpSelection}
            onClick={applyLink}
            className={`flex flex-1 items-center justify-center gap-1.5 ${BTN_PRIMARY}`}
          >
            <Link2 size={13} /> Link selected text
          </button>
          <button
            type="button"
            onClick={clearLink}
            title="Remove the link under the cursor"
            className={`flex items-center justify-center gap-1.5 ${BTN_GHOST} hover:border-red-200 hover:text-red-600`}
          >
            <Link2Off size={13} /> Remove
          </button>
        </div>
        {note ? <p className={HINT}>{note}</p> : null}

        <Field label="Link color">
          <ColorInput
            value={p.linkColor}
            onChange={(v) => setProp((n: TextProps) => (n.linkColor = v))}
          />
        </Field>
        <Field label="Underline links">
          <ToggleInput
            value={p.linkUnderline}
            onChange={(v) => setProp((n: TextProps) => (n.linkUnderline = v))}
          />
        </Field>
        <Field
          label="Link the whole block"
          hint="Optional — makes the entire paragraph clickable instead of selected words."
        >
          <TextInput
            value={p.href}
            placeholder="https://example.com"
            onChange={(v) => setProp((n: TextProps) => (n.href = v))}
          />
        </Field>
      </div>
    </>
  );
}

Text.craft = {
  displayName: 'Text',
  props: DEFAULTS,
  related: { settings: TextSettings },
};
