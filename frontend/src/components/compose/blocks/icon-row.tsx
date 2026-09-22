'use client';

import { useEditor, useNode } from '@craftjs/core';
import { Plus, Trash2 } from 'lucide-react';
import {
  AlignInput,
  BackgroundInput,
  BTN_DASHED,
  BTN_ICON,
  CARD,
  ColorInput,
  Field,
  ImageSourceInput,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleInput,
} from '@/components/compose/inputs';
import { useResolvedImage } from '@/components/compose/use-resolved-image';
import { SOCIAL_PLATFORMS, SocialIconSvg } from '@/lib/compose/social-icons';
import type { IconRowProps, SocialIcon } from '@/lib/compose/types';

/** A custom icon's artwork, proxied if the host blocks the browser. */
function CustomIcon({ src, alt, size }: { src: string; alt: string | undefined; size: number }) {
  const { imgProps, imgKey } = useResolvedImage(src);
  return (
    // A plain <img>, not next/image: the source is an arbitrary remote URL
    // (sometimes proxied through this app), which the optimiser cannot take.
    <img
      key={imgKey}
      {...imgProps}
      alt={alt ?? ''}
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
    />
  );
}

const PLATFORM_OPTIONS = [
  ...SOCIAL_PLATFORMS,
  { value: 'custom', label: 'Custom image (PNG / SVG)' },
];

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: IconRowProps = {
  icons: [
    { id: 'icon-1', platform: 'facebook', url: 'https://facebook.com' },
    { id: 'icon-2', platform: 'instagram', url: 'https://instagram.com' },
    { id: 'icon-3', platform: 'x', url: 'https://x.com' },
    { id: 'icon-4', platform: 'linkedin', url: 'https://linkedin.com' },
    { id: 'icon-5', platform: 'youtube', url: 'https://youtube.com' },
  ],
  size: 16,
  gap: 10,
  shape: 'circle',
  background: '#0B2436',
  iconColor: '#FFFFFF',
  align: 'center',
  paddingY: 12,
};

/**
 * A row of social or contact chips.
 *
 * Laid out with flex on the canvas but exported as table cells, because flex
 * is unreliable in mail clients. The two agree on spacing because the export
 * splits the same `gap` across each cell's left and right padding.
 */
export function IconRow(props: Partial<IconRowProps>) {
  const { icons, size, gap, shape, background, iconColor, align, paddingY } = {
    ...DEFAULTS,
    ...props,
  };
  const {
    connectors: { connect, drag },
  } = useNode();
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));

  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '8px' : '0px';

  return (
    <div
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      style={{ padding: `${paddingY}px 0`, textAlign: align }}
    >
      <div style={{ display: 'inline-flex', gap }}>
        {icons.map((icon) => {
          const custom = icon.platform === 'custom';
          const chip = (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size + 20,
                height: size + 20,
                background: custom && icon.chip === false ? 'transparent' : background,
                borderRadius: radius,
              }}
            >
              {custom ? (
                icon.src ? (
                  <CustomIcon src={icon.src} alt={icon.alt} size={size} />
                ) : (
                  <span
                    style={{
                      width: size,
                      height: size,
                      border: '1px dashed rgba(148,148,148,.7)',
                      borderRadius: 3,
                    }}
                  />
                )
              ) : (
                <SocialIconSvg platform={icon.platform} size={size} color={iconColor} />
              )}
            </span>
          );

          return (
            <span key={icon.id} title={icon.url}>
              {!enabled && icon.url ? (
                <a
                  href={icon.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block' }}
                >
                  {chip}
                </a>
              ) : (
                chip
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function IconRowSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as IconRowProps);

  const updateIcon = (id: string, patch: Partial<SocialIcon>): void =>
    setProp((n: IconRowProps) => {
      const index = n.icons.findIndex((icon) => icon.id === id);
      if (index > -1) n.icons[index] = { ...(n.icons[index] as SocialIcon), ...patch };
    });

  const addIcon = (platform: string): void =>
    setProp((n: IconRowProps) => {
      n.icons.push({
        id: `icon-${Date.now()}`,
        platform,
        url: platform === 'custom' ? '' : 'https://example.com',
        src: '',
        alt: '',
        chip: true,
      });
    });

  const removeIcon = (id: string): void =>
    setProp((n: IconRowProps) => {
      n.icons = n.icons.filter((icon) => icon.id !== id);
    });

  return (
    <>
      <Field label="Icons">
        <div className="space-y-2">
          {p.icons.map((icon) => (
            <div key={icon.id} className={`space-y-2.5 ${CARD}`}>
              <div className="flex items-center gap-2">
                <SelectInput
                  value={icon.platform}
                  onChange={(v) => updateIcon(icon.id, { platform: v })}
                  options={PLATFORM_OPTIONS}
                />
                <button
                  type="button"
                  aria-label="Remove icon"
                  onClick={() => removeIcon(icon.id)}
                  className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {icon.platform === 'custom' ? (
                <>
                  <ImageSourceInput
                    value={icon.src}
                    placeholder="Icon PNG / SVG URL"
                    onChange={(v) => updateIcon(icon.id, { src: v })}
                  />
                  <TextInput
                    value={icon.alt}
                    placeholder="Alt text"
                    onChange={(v) => updateIcon(icon.id, { alt: v })}
                  />
                  <ToggleInput
                    value={icon.chip !== false}
                    label="Chip behind icon"
                    onChange={(v) => updateIcon(icon.id, { chip: v })}
                  />
                </>
              ) : null}

              <TextInput
                value={icon.url}
                placeholder="https://&hellip;"
                onChange={(v) => updateIcon(icon.id, { url: v })}
              />
            </div>
          ))}

          <div className="flex gap-2">
            <button type="button" onClick={() => addIcon('website')} className={BTN_DASHED}>
              <Plus size={13} /> Add icon
            </button>
            <button type="button" onClick={() => addIcon('custom')} className={BTN_DASHED}>
              <Plus size={13} /> Custom icon
            </button>
          </div>
        </div>
      </Field>

      <Field label="Alignment">
        <AlignInput value={p.align} onChange={(v) => setProp((n: IconRowProps) => (n.align = v))} />
      </Field>
      <Field label="Shape">
        <SelectInput<IconRowProps['shape']>
          value={p.shape}
          onChange={(v) => setProp((n: IconRowProps) => (n.shape = v))}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded square' },
            { value: 'square', label: 'Square' },
          ]}
        />
      </Field>
      <Field label="Icon size">
        <NumberInput
          value={p.size}
          min={10}
          max={32}
          suffix="px"
          onChange={(v) => setProp((n: IconRowProps) => (n.size = v))}
        />
      </Field>
      <Field label="Spacing">
        <NumberInput
          value={p.gap}
          max={40}
          suffix="px"
          onChange={(v) => setProp((n: IconRowProps) => (n.gap = v))}
        />
      </Field>
      <Field label="Chip background">
        <BackgroundInput
          value={p.background}
          onChange={(v) => setProp((n: IconRowProps) => (n.background = v))}
        />
      </Field>
      <Field label="Icon color">
        <ColorInput
          value={p.iconColor}
          onChange={(v) => setProp((n: IconRowProps) => (n.iconColor = v))}
        />
      </Field>
    </>
  );
}

IconRow.craft = {
  displayName: 'Social Icons',
  props: DEFAULTS,
  related: { settings: IconRowSettings },
};
