import type { CSSProperties } from 'react';
import type { Align, LogoLayer } from './types';

/**
 * The complete definition of a logo layer, and the email HTML it produces.
 *
 * One source of truth on purpose: the exported email and the banner drawn on
 * the canvas are built from these same functions, so what is edited is the
 * markup that ships. A layer that looks right while composing cannot then
 * arrive wrong.
 */

/** Every property a layer carries, with the value used when it is unset. */
export const LOGO_LAYER_DEFAULTS = {
  src: '',
  alt: '',
  width: 22,
  x: 50,
  y: 50,
  opacity: 1,
  href: '',
} as const;

/** The width a mail client is told to use, for a 600px-wide email. */
export const EMAIL_WIDTH = 600;

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const attr = (value: unknown): string => escapeHtml(value).replace(/"/g, '&quot;');

const num = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export interface ResolvedLogoLayer {
  src: string;
  alt: string;
  width: number;
  x: number;
  y: number;
  opacity: number;
  href: string;
  /** Derived, never stored -- it depends on the 600px email width. */
  pixelWidth: number;
}

/** Fills in anything a layer does not set, so the HTML is always complete. */
export function logoLayerProps(layer: Partial<LogoLayer> = {}): ResolvedLogoLayer {
  const width = Math.min(100, Math.max(1, num(layer.width, LOGO_LAYER_DEFAULTS.width)));
  return {
    src: String(layer.src || ''),
    alt: String(layer.alt || ''),
    width,
    x: Math.min(100, Math.max(0, num(layer.x, LOGO_LAYER_DEFAULTS.x))),
    y: Math.min(100, Math.max(0, num(layer.y, LOGO_LAYER_DEFAULTS.y))),
    opacity: Math.min(1, Math.max(0, num(layer.opacity, LOGO_LAYER_DEFAULTS.opacity))),
    href: String(layer.href || ''),
    pixelWidth: Math.max(1, Math.round((width / 100) * EMAIL_WIDTH)),
  };
}

/** The positioned box, as CSS declarations. */
export function logoLayerBoxCss(layer: Partial<LogoLayer>): string {
  const p = logoLayerProps(layer);
  return (
    `position:absolute;` +
    `left:${p.x}%;` +
    `top:${p.y}%;` +
    `width:${p.width}%;` +
    `opacity:${p.opacity};` +
    `transform:translate(-50%,-50%);`
  );
}

/** The same box as a React style object, for the draggable wrapper. */
export function logoLayerBoxStyle(layer: Partial<LogoLayer>): CSSProperties {
  const p = logoLayerProps(layer);
  return {
    position: 'absolute',
    left: `${p.x}%`,
    top: `${p.y}%`,
    width: `${p.width}%`,
    opacity: p.opacity,
    transform: 'translate(-50%, -50%)',
  };
}

/**
 * What sits inside the positioned box: the image, wrapped in its link when it
 * has one.
 *
 * `srcOverride` lets the canvas draw the picture through this app's server
 * without changing the URL the email carries.
 *
 * The box lives on whichever element is outermost, so a link is the clickable
 * area rather than a collapsed anchor around a positioned image. When the
 * image itself is that box its width comes from the box, and adding
 * `width:100%` would override it; without a box -- on the canvas, where a
 * draggable wrapper carries it -- the image fills whatever holds it instead.
 */
export function logoLayerInnerHtml(
  layer: Partial<LogoLayer>,
  { srcOverride, boxCss = '' }: { srcOverride?: string; boxCss?: string } = {},
): string {
  const p = logoLayerProps(layer);
  if (!p.src) return '';

  const src = srcOverride || p.src;
  const imgStyle =
    p.href || !boxCss
      ? `display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;`
      : `${boxCss}display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;`;

  const img =
    `<img src="${attr(src)}" alt="${attr(p.alt)}" width="${p.pixelWidth}" ` +
    `referrerpolicy="no-referrer" style="${imgStyle}" />`;

  return p.href
    ? `<a href="${attr(p.href)}" target="_blank" rel="noopener noreferrer" ` +
        `style="${boxCss}display:block;text-decoration:none;border:0;">${img}</a>`
    : img;
}

/** One complete positioned layer, as it appears in the email. */
export function logoLayerHtml(
  layer: Partial<LogoLayer>,
  options: { srcOverride?: string } = {},
): string {
  return logoLayerInnerHtml(layer, { ...options, boxCss: logoLayerBoxCss(layer) });
}

/**
 * All the layers for a block.
 *
 * Wrapped in a negated MSO conditional so older desktop Outlook -- which
 * cannot position anything and would stack the layers down the page -- drops
 * them entirely and keeps the block underneath intact.
 */
export function logoLayersHtml(
  layers: LogoLayer[] = [],
  options?: { srcOverride?: string },
): string {
  const html = layers
    .map((layer) => logoLayerHtml(layer, options))
    .filter(Boolean)
    .join('\n      ');

  if (!html) return '';

  return `<!--[if !mso]><!-->
      ${html}
      <!--<![endif]-->`;
}

/** Shared by the logo and image builders, which align the same three ways. */
export function alignMargin(align: Align): string {
  if (align === 'center') return '0 auto';
  if (align === 'right') return '0 0 0 auto';
  return '0';
}
