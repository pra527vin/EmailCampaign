/**
 * The shapes the visual composer works in.
 *
 * Two families live here and they are deliberately separate:
 *
 *  - **The craft.js serialised tree** (`SerializedNode`). This is what the
 *    editor hands over and what gets stored. Its `props` are `unknown` because
 *    craft.js has no idea which block a node is until the exporter reads
 *    `type.resolvedName`.
 *  - **The block props** (`SectionProps` and friends). Each names exactly what
 *    one block carries. The exporter narrows from the first to the second by
 *    switching on the resolved name, which is the only point where the two
 *    families meet.
 *
 * Keeping them apart is what lets the exporter stay honest: a block that adds
 * a prop has to declare it here before the exporter can render it.
 */

/** Horizontal placement, shared by nearly every block. */
export type Align = 'left' | 'center' | 'right';

/* -- The craft.js serialised tree ------------------------------------------ */

/**
 * One node as `query.serialize()` writes it.
 *
 * `props` is intentionally opaque. Every consumer narrows it through the
 * block's own interface after reading the resolved name, so a mismatch shows
 * up as a compile error in the exporter rather than as `undefined` in the
 * generated email.
 */
export interface SerializedNode {
  type: { resolvedName: string } | string;
  isCanvas?: boolean;
  props: Record<string, unknown>;
  displayName?: string;
  custom?: { displayName?: string };
  parent: string | null;
  hidden?: boolean;
  nodes: string[];
  linkedNodes?: Record<string, string>;
}

export type SerializedNodes = Record<string, SerializedNode>;

/* -- Brand kit ------------------------------------------------------------- */

/** A web font the operator added themselves, beyond the built-in list. */
export interface CustomFont {
  id: string;
  label: string;
  stack: string;
  url: string;
}

/**
 * Defaults every block can point at, so a colour or a logo is set once rather
 * than repeated on each block.
 */
export interface BrandKit {
  brandName: string;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
  backgroundColor: string;
  fontFamily: string;
  customFonts: CustomFont[];
}

/* -- Blocks ---------------------------------------------------------------- */

/**
 * An image floated over a Banner or an Image block.
 *
 * Positions are percentages rather than pixels so a layer stays where it was
 * put when the block is resized, and `pixelWidth` is derived from the 600px
 * email width at render time rather than stored.
 */
export interface LogoLayer {
  id: string;
  src: string;
  alt: string;
  /** % of the block's width. */
  width: number;
  /** % from the left, to the layer's centre. */
  x: number;
  /** % from the top, to the layer's centre. */
  y: number;
  /** 0 - 1. */
  opacity: number;
  href: string;
}

/** How a section's boundary is drawn. */
export type SectionBorderStyle = 'solid' | 'dashed' | 'dotted';

export interface SectionProps {
  background: string;
  paddingTop: number;
  paddingBottom: number;
  paddingX: number;
  /** The rule above the section, which separates one band from the next. */
  borderTop: number;
  /** The box drawn around the whole section. */
  borderWidth: number;
  borderStyle: SectionBorderStyle;
  borderColor: string;
  borderRadius: number;
}

export interface BannerProps {
  background: string;
  align: Align;
  paddingY: number;
  minHeight: number;
  showBrandName: boolean;
  brandName: string;
  showTagline: boolean;
  tagline: string;
  textColor: string;
  fontFamily: string;
  logos: LogoLayer[];
}

export interface LogoProps {
  src: string;
  alt: string;
  /** Pixels -- a logo is sized absolutely, unlike an Image block. */
  width: number;
  /** Pixels; 0 scales from the width. */
  height: number;
  align: Align;
  href: string;
  paddingY: number;
}

/** The tags a Text block can render as, each with its own size preset. */
export type TextTag = 'h1' | 'h2' | 'h3' | 'p' | 'small';

export interface TextProps {
  text: string;
  tag: TextTag;
  fontSize: number;
  fontWeight: number;
  color: string;
  lineHeight: number;
  fontFamily: string;
  align: Align;
  paddingY: number;
  /** Links the whole block, rather than words inside it. */
  href: string;
  /**
   * How inline links are painted. The exporter never reads these: the styles
   * are written into the block's own HTML when a link is applied, so they
   * travel inside `text` rather than beside it.
   */
  linkColor: string;
  linkUnderline: boolean;
}

export interface ButtonLinkProps {
  text: string;
  href: string;
  background: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
  paddingWrapperY: number;
  align: Align;
  /**
   * Canvas-only. The exported button sizes itself to its label, which is what
   * every client renders reliably; this only stretches the preview.
   */
  fullWidth: boolean;
}

export interface LinkTextProps {
  text: string;
  href: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  underline: boolean;
  align: Align;
  paddingY: number;
}

export interface ImageBlockProps {
  src: string;
  alt: string;
  /** % of the 600px email. */
  width: number;
  /** Pixels; 0 scales from the width. */
  height: number;
  borderRadius: number;
  align: Align;
  href: string;
  paddingY: number;
  logos: LogoLayer[];
}

/**
 * One chip in a social row. `platform: 'custom'` swaps the built-in glyph for
 * an image at `src`.
 *
 * The custom-only fields are optional rather than defaulted because a row
 * restored from an older saved design will not carry them, and claiming
 * otherwise would be a lie the readers below have to defend against anyway.
 */
export interface SocialIcon {
  id: string;
  platform: string;
  url: string;
  src?: string;
  alt?: string;
  /** Defaults to shown; only a custom icon can turn the chip off. */
  chip?: boolean;
}

export interface IconRowProps {
  icons: SocialIcon[];
  size: number;
  gap: number;
  shape: 'circle' | 'rounded' | 'square';
  background: string;
  iconColor: string;
  align: Align;
  paddingY: number;
}

export interface DividerProps {
  color: string;
  thickness: number;
  marginY: number;
}

export interface SpacerProps {
  height: number;
}

export type BulletMarkerType = 'bullet' | 'number' | 'check' | 'arrow' | 'custom';

export interface BulletItem {
  id: string;
  text: string;
}

export interface BulletListProps {
  items: BulletItem[];
  markerType: BulletMarkerType;
  customMarker: string;
  markerColor: string;
  markerWidth: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  itemSpacing: number;
}

export interface DataTableProps {
  cells: string[][];
  headerRow: boolean;
  striped: boolean;
  headerBg: string;
  headerColor: string;
  stripedBg: string;
  cellBg: string;
  cellColor: string;
  borderWidth: number;
  borderColor: string;
  cellPadding: number;
  fontSize: number;
}
