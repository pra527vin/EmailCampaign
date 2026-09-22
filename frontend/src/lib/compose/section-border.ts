import type { CSSProperties } from 'react';
import type { SectionBorderStyle, SectionProps } from './types';

/**
 * A section's boundary, described once for both renderers.
 *
 * Same reason the logo and image builders sit beside the exporter: the canvas
 * and the email are drawn from one description, so a border cannot look one
 * way while composing and another way on arrival.
 *
 * Two widths, because they do different jobs. `borderWidth` is the box drawn
 * around the whole section. `borderTop` is the single rule that separates one
 * band from the next -- the footer divider the starter template uses -- and it
 * takes the top edge when both are set.
 */

export const SECTION_BORDER_DEFAULTS = {
  borderWidth: 0,
  borderTop: 0,
  borderStyle: 'solid' as SectionBorderStyle,
  borderColor: '#E3E8EE',
  borderRadius: 0,
};

const num = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;

export interface ResolvedSectionBorder {
  /** All four widths, top first, as CSS writes them. */
  widths: [number, number, number, number];
  style: SectionBorderStyle;
  color: string;
  radius: number;
  /** False when no line is drawn, so neither renderer emits dead declarations. */
  visible: boolean;
}

export function sectionBorder(p: Partial<SectionProps>): ResolvedSectionBorder {
  const box = num(p.borderWidth, SECTION_BORDER_DEFAULTS.borderWidth);
  const top = num(p.borderTop, SECTION_BORDER_DEFAULTS.borderTop);

  return {
    widths: [top || box, box, box, box],
    style: p.borderStyle ?? SECTION_BORDER_DEFAULTS.borderStyle,
    color: p.borderColor || SECTION_BORDER_DEFAULTS.borderColor,
    // Independent of the widths: rounding a background with no line around it
    // is a normal thing to want.
    radius: num(p.borderRadius, SECTION_BORDER_DEFAULTS.borderRadius),
    visible: box > 0 || top > 0,
  };
}

/**
 * The border as CSS declarations, for the exported email.
 *
 * Written as three longhands rather than a `border` shorthand followed by a
 * `border-top` override, because the shorthand pair only works if the client
 * honours declaration order and several rewrite the style attribute.
 */
export function sectionBorderCss(p: Partial<SectionProps>): string {
  const border = sectionBorder(p);
  let css = '';
  if (border.visible) {
    const widths = border.widths.map((width) => `${width}px`).join(' ');
    css += `border-style:${border.style};border-color:${border.color};border-width:${widths};`;
  }
  if (border.radius > 0) css += `border-radius:${border.radius}px;`;
  return css;
}

/** The same border as a React style object, for the canvas. */
export function sectionBorderStyle(p: Partial<SectionProps>): CSSProperties {
  const border = sectionBorder(p);
  const style: CSSProperties = {};
  if (border.visible) {
    style.borderStyle = border.style;
    style.borderColor = border.color;
    style.borderWidth = border.widths.map((width) => `${width}px`).join(' ');
  }
  if (border.radius > 0) style.borderRadius = border.radius;
  return style;
}
