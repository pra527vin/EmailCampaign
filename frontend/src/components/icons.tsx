import type { SVGProps } from 'react';

/**
 * The icon set, taken from the reference design.
 *
 * Every glyph is drawn on a 16x16 grid as an open stroke -- `fill: none`,
 * `stroke: currentColor`, 1.5 units wide -- rather than as a filled silhouette.
 * That is what gives the reference its light, drawn feel, and it means one
 * `color` controls the glyph the same way it controls the label beside it.
 *
 * Strokes are specified in user units, so a glyph rendered larger than 16px
 * also gets a proportionally heavier line. `vectorEffect` is deliberately not
 * used: at the two sizes in play (16 and 17) the difference is invisible, and
 * matching the reference's weight matters more than perfect optical scaling.
 */
const GLYPHS = {
  dashboard: (
    <>
      <rect x="1.8" y="1.8" width="5" height="5" rx="1" />
      <rect x="9.2" y="1.8" width="5" height="5" rx="1" />
      <rect x="1.8" y="9.2" width="5" height="5" rx="1" />
      <rect x="9.2" y="9.2" width="5" height="5" rx="1" />
    </>
  ),
  lists: <path d="M2 4h12M2 8h12M2 12h8" />,
  templates: (
    <>
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" />
      <path d="M1.8 6h12.4M6 6v7.6" />
    </>
  ),
  campaigns: <path d="M14 2L1.8 6.6l4.3 1.7L8 13z" />,
  compose: (
    <>
      <path d="M13.4 8.8v3.8a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 12.6V4a1.4 1.4 0 0 1 1.4-1.4h3.8" />
      <path d="M11.3 2.1l2.6 2.6-5 5H6.3V7.1z" />
    </>
  ),
  send: (
    <>
      <rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.4" />
      <path d="M2.4 4.4L8 8.8l5.6-4.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1L3.5 12.5" />
    </>
  ),
  recipients: (
    <>
      <circle cx="6" cy="5.4" r="2.3" />
      <path d="M1.9 13c0-2.3 1.8-3.6 4.1-3.6S10.1 10.7 10.1 13" />
      <path d="M11 3.6a2.2 2.2 0 010 4.1M12.4 9.9c1.1.5 1.8 1.5 1.8 3.1" />
    </>
  ),
  edit: (
    <>
      <path d="M11.4 2.9l1.7 1.7-7.5 7.5-2.2.5.5-2.2z" />
      <path d="M10.2 4.1l1.7 1.7" />
    </>
  ),
  trash: (
    <>
      <path d="M2.8 4.2h10.4" />
      <path d="M6.2 4.2V2.9h3.6v1.3" />
      <path d="M4.1 4.2l.6 8.2a1 1 0 001 .9h4.6a1 1 0 001-.9l.6-8.2" />
      <path d="M6.7 6.8v4M9.3 6.8v4" />
    </>
  ),
  duplicate: (
    <>
      <rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.3" />
      <path d="M10.4 5.6V4.1a1.3 1.3 0 00-1.3-1.3H4.1a1.3 1.3 0 00-1.3 1.3v5a1.3 1.3 0 001.3 1.3h1.5" />
    </>
  ),
  view: (
    <>
      <path d="M1.4 8s2.4-4.2 6.6-4.2S14.6 8 14.6 8s-2.4 4.2-6.6 4.2S1.4 8 1.4 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  chevron: <path d="M4 6.2L8 10.2l4-4" />,
  expand: (
    <>
      <path d="M9.6 2.6h3.8v3.8" />
      <path d="M6.4 13.4H2.6V9.6" />
      <path d="M13.4 2.6L9 7M2.6 13.4L7 9" />
    </>
  ),
  collapse: (
    <>
      <path d="M13.2 6.4H9.4V2.6" />
      <path d="M2.8 9.6h3.8v3.8" />
      <path d="M9.4 6.6l4-4M6.6 9.4l-4 4" />
    </>
  ),
  back: <path d="M13 8H3.4M7 3.8L2.8 8l4.2 4.2" />,
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="M10.4 10.4l2.8 2.8" />
    </>
  ),
  menu: <path d="M2 4h12M2 8h12M2 12h12" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({
  name,
  size = 16,
  ...props
}: { name: GlyphName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
