'use client';

import { useEditor, useNode } from '@craftjs/core';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import { LogoLayerFields, LogoLayers } from '@/components/compose/blocks/logo-layers';
import { useElementSize } from '@/components/compose/use-element-size';
import {
  AlignInput,
  BackgroundInput,
  ColorInput,
  Field,
  FontInput,
  NumberInput,
  ToggleInput,
} from '@/components/compose/inputs';
import type { BannerProps, LogoLayer } from '@/lib/compose/types';

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: BannerProps = {
  brandName: 'Your brand',
  showBrandName: true,
  tagline: 'A short line about what you do',
  showTagline: true,
  background: '#0B2436',
  textColor: '#FFFFFF',
  fontFamily: '',
  align: 'center',
  paddingY: 32,
  minHeight: 60,
  logos: [],
};

/**
 * The masthead: brand name, tagline, and any number of positioned logos.
 *
 * The text is edited in place and the logos float above it, which is why the
 * inner box is `position: relative` -- the layers are absolutely positioned
 * against it in both the canvas and the exported email.
 */
export function Banner(props: Partial<BannerProps>) {
  const {
    brandName,
    showBrandName,
    tagline,
    showTagline,
    background,
    textColor,
    fontFamily,
    align,
    paddingY,
    minHeight,
    logos,
  } = { ...DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));

  const updateLayer = (id: string, patch: Partial<LogoLayer>): void =>
    setProp((p: BannerProps) => {
      if (!p.logos) p.logos = [];
      const index = p.logos.findIndex((layer) => layer.id === id);
      if (index > -1) p.logos[index] = { ...(p.logos[index] as LogoLayer), ...patch };
    });

  const removeLayer = (id: string): void =>
    setProp((p: BannerProps) => {
      if (!p.logos) return;
      const index = p.logos.findIndex((layer) => layer.id === id);
      if (index > -1) p.logos.splice(index, 1);
    });

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
      style={{ background }}
    >
      <tbody>
        <tr>
          <td style={{ textAlign: align }}>
            <div style={{ position: 'relative', padding: `${paddingY}px 24px`, minHeight }}>
              {showBrandName ? (
                <ContentEditable
                  html={brandName || ''}
                  tagName="div"
                  onChange={(event: ContentEditableEvent) =>
                    setProp((p: BannerProps) => (p.brandName = event.target.value))
                  }
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: textColor,
                    fontFamily: fontFamily || 'inherit',
                    letterSpacing: '0.01em',
                    marginBottom: showTagline ? 4 : 0,
                  }}
                />
              ) : null}
              {showTagline ? (
                <ContentEditable
                  html={tagline || ''}
                  tagName="div"
                  onChange={(event: ContentEditableEvent) =>
                    setProp((p: BannerProps) => (p.tagline = event.target.value))
                  }
                  style={{
                    fontSize: 13,
                    color: textColor,
                    fontFamily: fontFamily || 'inherit',
                    opacity: 0.7,
                  }}
                />
              ) : null}
              <LogoLayers
                layers={logos ?? []}
                enabled={enabled}
                onUpdate={updateLayer}
                onRemove={removeLayer}
                asHtml
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function BannerSettings() {
  const {
    dom,
    props: p,
    actions: { setProp },
  } = useNode((node) => ({ dom: node.dom, props: node.data.props as BannerProps }));

  const size = useElementSize(dom);

  const setLayers = (mutate: (list: LogoLayer[]) => void): void =>
    setProp((n: BannerProps) => {
      if (!n.logos) n.logos = [];
      mutate(n.logos);
    });

  return (
    <>
      {/* Read-only, and first, because it answers the question anyone sizing a
          logo or a background asks before they touch a control. */}
      <Field
        label="Size"
        hint="Measured from the canvas. A sent email is 600px wide, so build artwork against that — at twice these numbers if it should stay sharp on a retina screen."
      >
        <div className="flex items-baseline gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900">
          {size ? (
            <>
              <span>{size.width}</span>
              <span className="text-slate-400">&times;</span>
              <span>{size.height}</span>
              <span className="text-2xs font-normal text-slate-500">px</span>
            </>
          ) : (
            <span className="font-normal text-slate-500">Measuring&hellip;</span>
          )}
        </div>
      </Field>

      <Field label="Show brand name">
        <ToggleInput
          value={p.showBrandName}
          onChange={(v) => setProp((n: BannerProps) => (n.showBrandName = v))}
        />
      </Field>
      <Field label="Show tagline">
        <ToggleInput
          value={p.showTagline}
          onChange={(v) => setProp((n: BannerProps) => (n.showTagline = v))}
        />
      </Field>
      <Field label="Font">
        <FontInput
          value={p.fontFamily}
          onChange={(v) => setProp((n: BannerProps) => (n.fontFamily = v))}
        />
      </Field>
      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: BannerProps) => (n.align = v))} />
      </Field>
      <Field label="Background color">
        <BackgroundInput
          value={p.background}
          onChange={(v) => setProp((n: BannerProps) => (n.background = v))}
        />
      </Field>
      <Field label="Text color">
        <ColorInput
          value={p.textColor}
          onChange={(v) => setProp((n: BannerProps) => (n.textColor = v))}
        />
      </Field>
      <Field label="Vertical padding">
        <NumberInput
          value={p.paddingY}
          max={120}
          suffix="px"
          onChange={(v) => setProp((n: BannerProps) => (n.paddingY = v))}
        />
      </Field>
      <Field
        label="Minimum height"
        hint="Room for logo layers when the banner has little or no text."
      >
        <NumberInput
          value={p.minHeight}
          max={400}
          suffix="px"
          onChange={(v) => setProp((n: BannerProps) => (n.minHeight = v))}
        />
      </Field>

      <LogoLayerFields layers={p.logos ?? []} setLayers={setLayers} showHtml />
    </>
  );
}

Banner.craft = {
  displayName: 'Banner',
  props: DEFAULTS,
  related: { settings: BannerSettings },
};
