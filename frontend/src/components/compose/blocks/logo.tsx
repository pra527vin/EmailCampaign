'use client';

import { useEditor, useNode } from '@craftjs/core';
import { HtmlDisclosure } from '@/components/compose/html-disclosure';
import { HtmlImage } from '@/components/compose/html-image';
import {
  AlignInput,
  Field,
  ImageSourceInput,
  NumberInput,
  TextInput,
} from '@/components/compose/inputs';
import { useResolvedImage } from '@/components/compose/use-resolved-image';
import {
  logoBlockHtml,
  logoBlockImgHtml,
  logoBlockProps,
} from '@/lib/compose/image-block-html';
import type { LogoProps } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: LogoProps = {
  src: '',
  alt: 'Logo',
  width: 100,
  height: 0,
  align: 'center',
  href: '',
  paddingY: 8,
};

/**
 * A standalone brand mark, sized in pixels.
 *
 * Drawn from the exact markup the export will carry, pointed at a loadable
 * copy of the picture only when the host refuses the browser directly. The
 * link is left off while editing: the export always carries it, but a live
 * anchor here would navigate away instead of selecting the block.
 */
export function Logo(props: Partial<LogoProps>) {
  const { src, alt, width, height, align, href, paddingY } = { ...DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const { resolved, imgProps } = useResolvedImage(src);

  const html = logoBlockImgHtml(
    { src, alt, width, height, align, href: enabled ? '' : href },
    { srcOverride: resolved },
  );

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      style={{ padding: `${paddingY}px 0`, textAlign: align }}
    >
      {src ? (
        <HtmlImage
          html={html}
          onLoad={imgProps.onLoad as () => void}
          onError={imgProps.onError as () => void}
        />
      ) : (
        <div className="text-xs text-slate-400">
          No logo yet &mdash; paste a URL and click Insert, or upload a PNG / SVG
        </div>
      )}
    </div>
  );
}

function LogoSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as LogoProps);

  const resolved = logoBlockProps(p);

  return (
    <>
      <Field label="Logo" hint="Paste a link to the image and click Insert, or upload the file.">
        <ImageSourceInput value={p.src} onChange={(v) => setProp((n: LogoProps) => (n.src = v))} />
      </Field>
      <Field
        label="Alt text"
        hint="Shown by mail clients that block images until the reader allows them."
      >
        <TextInput value={p.alt} onChange={(v) => setProp((n: LogoProps) => (n.alt = v))} />
      </Field>
      <Field label="Link URL (optional)">
        <TextInput
          value={p.href}
          placeholder="https://example.com"
          onChange={(v) => setProp((n: LogoProps) => (n.href = v))}
        />
      </Field>
      <Field label="Width">
        <NumberInput
          value={p.width}
          min={20}
          max={320}
          suffix="px"
          onChange={(v) => setProp((n: LogoProps) => (n.width = v))}
        />
      </Field>
      <Field
        label="Height"
        hint="0 scales automatically from the width, keeping the image's own proportions."
      >
        <NumberInput
          value={p.height}
          min={0}
          max={320}
          suffix="px"
          onChange={(v) => setProp((n: LogoProps) => (n.height = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: LogoProps) => (n.align = v))} />
      </Field>
      <Field label="Vertical spacing">
        <NumberInput
          value={p.paddingY}
          max={60}
          suffix="px"
          onChange={(v) => setProp((n: LogoProps) => (n.paddingY = v))}
        />
      </Field>

      {resolved.src ? (
        <div className="mb-[18px] border-t border-slate-200 pt-[18px]">
          <HtmlDisclosure
            html={logoBlockHtml(p)}
            facts={[
              { label: 'Source', value: resolved.src, truncate: true },
              { label: 'Width', value: `${resolved.width}px` },
              { label: 'Height', value: resolved.height ? `${resolved.height}px` : 'auto' },
              { label: 'Alt text', value: resolved.alt || '(none)' },
              { label: 'Link', value: resolved.href || '(none)', truncate: true },
            ]}
            note="This is exactly what the export sends and the canvas above draws."
          />
        </div>
      ) : null}
    </>
  );
}

Logo.craft = {
  displayName: 'Logo',
  props: DEFAULTS,
  related: { settings: LogoSettings },
};
