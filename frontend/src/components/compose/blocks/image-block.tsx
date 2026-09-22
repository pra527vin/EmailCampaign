'use client';

import { useEditor, useNode } from '@craftjs/core';
import { ImageIcon } from 'lucide-react';
import { LogoLayerFields, LogoLayers } from '@/components/compose/blocks/logo-layers';
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
import { imageBlockImgHtml, imageBlockProps } from '@/lib/compose/image-block-html';
import type { ImageBlockProps, LogoLayer } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: ImageBlockProps = {
  src: '',
  alt: 'Descriptive alt text',
  width: 100,
  height: 0,
  href: '',
  align: 'center',
  borderRadius: 0,
  paddingY: 8,
  logos: [],
};

/**
 * A picture sized as a share of the email's width, with optional logo layers
 * floating over it.
 *
 * As with the Logo block, the canvas draws the exported markup rather than a
 * React approximation, and the link is dropped while editing so clicking
 * selects the block instead of navigating away.
 */
export function ImageBlock(props: Partial<ImageBlockProps>) {
  const { src, alt, width, height, href, align, borderRadius, paddingY, logos } = {
    ...DEFAULTS,
    ...props,
  };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const { resolved, imgProps } = useResolvedImage(src);

  const updateLayer = (id: string, patch: Partial<LogoLayer>): void =>
    setProp((p: ImageBlockProps) => {
      if (!p.logos) p.logos = [];
      const index = p.logos.findIndex((layer) => layer.id === id);
      if (index > -1) p.logos[index] = { ...(p.logos[index] as LogoLayer), ...patch };
    });

  const removeLayer = (id: string): void =>
    setProp((p: ImageBlockProps) => {
      if (!p.logos) return;
      const index = p.logos.findIndex((layer) => layer.id === id);
      if (index > -1) p.logos.splice(index, 1);
    });

  const margin = align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0';

  const html = imageBlockImgHtml(
    { src, alt, height, href: enabled ? '' : href, borderRadius },
    { srcOverride: resolved },
  );

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      style={{ padding: `${paddingY}px 0`, textAlign: align }}
    >
      <div
        style={{
          position: 'relative',
          width: `${width}%`,
          margin,
          overflow: 'hidden',
          borderRadius,
        }}
      >
        {src ? (
          <HtmlImage
            html={html}
            onLoad={imgProps.onLoad as () => void}
            onError={imgProps.onError as () => void}
          />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <ImageIcon size={28} strokeWidth={1.5} />
          </div>
        )}
        <LogoLayers
          layers={logos ?? []}
          enabled={enabled}
          onUpdate={updateLayer}
          onRemove={removeLayer}
        />
      </div>
    </div>
  );
}

function ImageSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as ImageBlockProps);

  const resolved = imageBlockProps(p);

  const setLayers = (mutate: (list: LogoLayer[]) => void): void =>
    setProp((n: ImageBlockProps) => {
      if (!n.logos) n.logos = [];
      mutate(n.logos);
    });

  return (
    <>
      <Field label="Image" hint="Paste a link to the image and click Insert, or upload the file.">
        <ImageSourceInput
          value={p.src}
          placeholder="https://images.example.com/photo.jpg"
          onChange={(v) => setProp((n: ImageBlockProps) => (n.src = v))}
        />
      </Field>
      <Field label="Alt text" hint="Shown when images are blocked by the recipient's client.">
        <TextInput value={p.alt} onChange={(v) => setProp((n: ImageBlockProps) => (n.alt = v))} />
      </Field>
      <Field label="Link URL (optional)">
        <TextInput
          value={p.href}
          placeholder="https://example.com"
          onChange={(v) => setProp((n: ImageBlockProps) => (n.href = v))}
        />
      </Field>
      <Field label="Width">
        <NumberInput
          value={p.width}
          min={10}
          max={100}
          suffix="%"
          onChange={(v) => setProp((n: ImageBlockProps) => (n.width = v))}
        />
      </Field>
      <Field
        label="Height"
        hint="0 scales automatically from the width, keeping the image's own proportions."
      >
        <NumberInput
          value={p.height}
          min={0}
          max={800}
          suffix="px"
          onChange={(v) => setProp((n: ImageBlockProps) => (n.height = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput
          value={p.align}
          onChange={(v) => setProp((n: ImageBlockProps) => (n.align = v))}
        />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={p.borderRadius}
          max={40}
          suffix="px"
          onChange={(v) => setProp((n: ImageBlockProps) => (n.borderRadius = v))}
        />
      </Field>

      {resolved.src ? (
        <div className="mb-[18px] border-t border-slate-200 pt-[18px]">
          <HtmlDisclosure
            html={imageBlockImgHtml(p)}
            facts={[
              { label: 'Source', value: resolved.src, truncate: true },
              { label: 'Width', value: `${resolved.width}% of the email` },
              { label: 'Height', value: resolved.height ? `${resolved.height}px` : 'auto' },
              { label: 'Alt text', value: resolved.alt || '(none)' },
              { label: 'Link', value: resolved.href || '(none)', truncate: true },
            ]}
            note="This is exactly what the export sends and the canvas above draws."
          />
        </div>
      ) : null}

      <LogoLayerFields layers={p.logos ?? []} setLayers={setLayers} />
    </>
  );
}

ImageBlock.craft = {
  displayName: 'Image',
  props: DEFAULTS,
  related: { settings: ImageSettings },
};
