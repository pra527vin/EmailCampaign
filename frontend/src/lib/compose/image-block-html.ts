import { alignMargin } from './logo-layer-html';
import type { Align, ImageBlockProps, LogoProps } from './types';

/**
 * The complete definition of a standalone image -- the Logo block and the
 * Image block -- and the email HTML each produces.
 *
 * Same pattern as the logo layers: the export and the canvas are both built
 * from these functions, so the markup on screen is the markup that ships.
 *
 * The two blocks differ in one deliberate way. A logo is sized in pixels,
 * because a brand mark has a size it is meant to be; an image is sized as a
 * percentage of the 600px email, because it is meant to fill the column.
 */

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const attr = (value: unknown): string => escapeHtml(value).replace(/"/g, '&quot;');

const num = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

interface ImgOptions {
  srcOverride?: string;
  className?: string;
}

/* -- Logo block: a fixed pixel width -------------------------------------- */

export const LOGO_BLOCK_DEFAULTS = {
  src: '',
  alt: 'Logo',
  width: 100,
  /** 0 scales automatically from the width. */
  height: 0,
  align: 'center' as Align,
  href: '',
};

export interface ResolvedLogoBlock {
  src: string;
  alt: string;
  width: number;
  height: number;
  align: Align;
  href: string;
}

export function logoBlockProps(p: Partial<LogoProps> = {}): ResolvedLogoBlock {
  return {
    src: String(p.src || ''),
    alt: String(p.alt ?? LOGO_BLOCK_DEFAULTS.alt),
    width: Math.max(1, num(p.width, LOGO_BLOCK_DEFAULTS.width)),
    height: Math.max(0, num(p.height, LOGO_BLOCK_DEFAULTS.height)),
    align: p.align ?? LOGO_BLOCK_DEFAULTS.align,
    href: String(p.href || ''),
  };
}

export function logoBlockStyle(p: Partial<LogoProps>): string {
  const r = logoBlockProps(p);
  return (
    `display:block;` +
    `width:${r.width}px;` +
    `max-width:100%;` +
    `height:${r.height ? `${r.height}px` : 'auto'};` +
    `margin:${alignMargin(r.align)};` +
    `border:0;` +
    `outline:none;` +
    `text-decoration:none;`
  );
}

/** The `<img>`, wrapped in its `<a>` when linked. */
export function logoBlockImgHtml(
  p: Partial<LogoProps>,
  { srcOverride, className = 'logo-image' }: ImgOptions = {},
): string {
  const r = logoBlockProps(p);
  if (!r.src) return '';

  const src = srcOverride || r.src;
  const cls = className ? ` class="${attr(className)}"` : '';
  const img =
    `<img\n` +
    `  src="${attr(src)}"\n` +
    `  width="${r.width}"\n` +
    `  alt="${attr(r.alt)}"${cls}\n` +
    `  referrerpolicy="no-referrer"\n` +
    `  style="${logoBlockStyle(p)}"\n` +
    `/>`;

  return r.href
    ? `<a href="${attr(r.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;border:0;">${img}</a>`
    : img;
}

/** The full block: the image, aligned inside its padded wrapper. */
export function logoBlockHtml(p: Partial<LogoProps>, options?: ImgOptions): string {
  const r = logoBlockProps(p);
  const img = logoBlockImgHtml(p, options);
  if (!img) return '';
  return `<div style="padding:${num(p.paddingY, 8)}px 0;text-align:${r.align};">${img}</div>`;
}

/* -- Image block: width as a % of the email ------------------------------- */

export const IMAGE_BLOCK_DEFAULTS = {
  src: '',
  alt: '',
  /** % of the 600px email. */
  width: 100,
  height: 0,
  align: 'center' as Align,
  href: '',
  borderRadius: 0,
};

export interface ResolvedImageBlock {
  src: string;
  alt: string;
  width: number;
  height: number;
  align: Align;
  href: string;
  borderRadius: number;
}

export function imageBlockProps(p: Partial<ImageBlockProps> = {}): ResolvedImageBlock {
  return {
    src: String(p.src || ''),
    alt: String(p.alt || ''),
    width: Math.min(100, Math.max(1, num(p.width, IMAGE_BLOCK_DEFAULTS.width))),
    height: Math.max(0, num(p.height, IMAGE_BLOCK_DEFAULTS.height)),
    align: p.align ?? IMAGE_BLOCK_DEFAULTS.align,
    href: String(p.href || ''),
    borderRadius: Math.max(0, num(p.borderRadius, IMAGE_BLOCK_DEFAULTS.borderRadius)),
  };
}

export function imageBlockStyle(p: Partial<ImageBlockProps>): string {
  const r = imageBlockProps(p);
  return (
    `display:block;` +
    `width:100%;` +
    `max-width:100%;` +
    `height:${r.height ? `${r.height}px` : 'auto'};` +
    `border-radius:${r.borderRadius}px;` +
    `border:0;` +
    `outline:none;` +
    `text-decoration:none;`
  );
}

export function imageBlockImgHtml(
  p: Partial<ImageBlockProps>,
  { srcOverride, className = 'content-image' }: ImgOptions = {},
): string {
  const r = imageBlockProps(p);
  if (!r.src) return '';

  const src = srcOverride || r.src;
  const cls = className ? ` class="${attr(className)}"` : '';
  return (
    `<img\n` +
    `  src="${attr(src)}"\n` +
    `  alt="${attr(r.alt)}"${cls}\n` +
    `  referrerpolicy="no-referrer"\n` +
    `  style="${imageBlockStyle(p)}"\n` +
    `/>`
  );
}
