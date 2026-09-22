import type { BrandKit } from './types';

/**
 * The font registry shared by the composer UI and the HTML exporter.
 *
 * Two kinds of font, and the distinction matters at the receiver:
 *
 *  - **Email-safe** families are installed almost everywhere, so they need no
 *    stylesheet and always render as chosen.
 *  - **Web fonts** need a stylesheet URL, and plenty of clients (Outlook,
 *    several webmail providers) refuse to load one. Every web stack therefore
 *    ends in a safe family, so blocking the stylesheet degrades the type
 *    rather than breaking the layout.
 *
 * Custom fonts added in the Brand Kit behave exactly like the built-in web
 * fonts -- same shape, same fallback rule.
 */

export interface FontOption {
  label: string;
  stack: string;
  url: string;
  group: 'Email-safe' | 'Web fonts' | 'Custom';
  id?: string;
}

export const SAFE_FONTS: ReadonlyArray<{ label: string; stack: string }> = [
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', stack: 'Tahoma, Verdana, sans-serif' },
  { label: 'Trebuchet MS', stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { label: 'Palatino', stack: "'Palatino Linotype', Palatino, Georgia, serif" },
  { label: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { label: 'Lucida Sans', stack: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
];

const googleUrl = (family: string, weights = '400;500;600;700'): string =>
  `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`;

export const WEB_FONTS: ReadonlyArray<{ label: string; stack: string; url: string }> = [
  { label: 'Inter', stack: 'Inter, Helvetica, Arial, sans-serif', url: googleUrl('Inter') },
  { label: 'Roboto', stack: 'Roboto, Helvetica, Arial, sans-serif', url: googleUrl('Roboto') },
  {
    label: 'Open Sans',
    stack: "'Open Sans', Helvetica, Arial, sans-serif",
    url: googleUrl('Open+Sans'),
  },
  { label: 'Lato', stack: 'Lato, Helvetica, Arial, sans-serif', url: googleUrl('Lato', '400;700') },
  {
    label: 'Montserrat',
    stack: 'Montserrat, Helvetica, Arial, sans-serif',
    url: googleUrl('Montserrat'),
  },
  {
    label: 'Poppins',
    stack: 'Poppins, Helvetica, Arial, sans-serif',
    url: googleUrl('Poppins'),
  },
  {
    label: 'Space Grotesk',
    stack: "'Space Grotesk', Helvetica, Arial, sans-serif",
    url: googleUrl('Space+Grotesk'),
  },
  { label: 'Merriweather', stack: 'Merriweather, Georgia, serif', url: googleUrl('Merriweather', '400;700') },
  {
    label: 'Playfair Display',
    stack: "'Playfair Display', Georgia, serif",
    url: googleUrl('Playfair+Display'),
  },
  { label: 'Newsreader', stack: 'Newsreader, Georgia, serif', url: googleUrl('Newsreader', '300;400;500;600') },
];

/** Everything selectable, including the brand's own additions. */
export function allFonts(brand: BrandKit | null | undefined): FontOption[] {
  const custom: FontOption[] = (brand?.customFonts ?? []).map((font) => ({
    label: font.label,
    stack: font.stack,
    url: font.url || '',
    group: 'Custom',
    id: font.id,
  }));

  return [
    ...SAFE_FONTS.map((font): FontOption => ({ ...font, url: '', group: 'Email-safe' })),
    ...WEB_FONTS.map((font): FontOption => ({ ...font, group: 'Web fonts' })),
    ...custom,
  ];
}

/** The stylesheet URL a stack needs, or `''` when it needs none. */
export function fontUrlFor(stack: string | undefined, brand: BrandKit | null | undefined): string {
  if (!stack) return '';
  return allFonts(brand).find((font) => font.stack === stack)?.url ?? '';
}

/** Turns a bare family name typed by a person into a usable CSS stack. */
export function toStack(family: string, fallback = 'Helvetica, Arial, sans-serif'): string {
  const name = family.trim();
  if (!name) return fallback;
  if (name.includes(',')) return name;
  const quoted = /\s/.test(name) ? `'${name}'` : name;
  return `${quoted}, ${fallback}`;
}

/** A Google Fonts stylesheet URL guessed from a family name. */
export function googleUrlFor(family: string, weights = '400;500;600;700'): string {
  const name = family.trim();
  if (!name) return '';
  return googleUrl(name.replace(/\s+/g, '+'), weights);
}

/**
 * A node as either of the two callers holds it.
 *
 * `collectFontUrls` is called once against a serialised tree and once against
 * craft's live state, and those nest their props differently -- so it accepts
 * the union rather than forcing one caller to reshape its data.
 */
export interface FontSourceNode {
  props?: Record<string, unknown>;
  data?: { props?: Record<string, unknown> };
}

export type FontSourceNodes = Record<string, FontSourceNode>;

/**
 * Every stylesheet URL a design needs: the brand font, whatever any block
 * picked, and all custom fonts.
 *
 * Custom fonts go in unconditionally because they can be used inside inline
 * HTML the walk below cannot see.
 */
export function collectFontUrls(
  nodes: FontSourceNodes | null | undefined,
  brand: BrandKit | null | undefined,
): string[] {
  const urls = new Set<string>();

  const add = (stack: string | undefined): void => {
    const url = fontUrlFor(stack, brand);
    if (url) urls.add(url);
  };

  add(brand?.fontFamily);
  (brand?.customFonts ?? []).forEach((font) => {
    if (font.url) urls.add(font.url);
  });

  Object.values(nodes ?? {}).forEach((node) => {
    // Two node shapes reach here. The exporter walks a serialised tree, whose
    // props sit directly on the node; the canvas font loader walks craft's
    // live state, which nests them under `data`. Reading both is what keeps
    // the fonts on screen identical to the fonts in the export.
    const fontFamily = node?.props?.['fontFamily'] ?? node?.data?.props?.['fontFamily'];
    if (typeof fontFamily === 'string') add(fontFamily);
  });

  return [...urls];
}
