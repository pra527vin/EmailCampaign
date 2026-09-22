import { markerFor } from './bullet-markers';
import { collectFontUrls } from './fonts';
import { firstColor, isGradient } from './gradient';
import { imageBlockImgHtml, logoBlockHtml } from './image-block-html';
import { alignMargin, logoLayersHtml } from './logo-layer-html';
import { sectionBorderCss } from './section-border';
import { socialIconSvgMarkup } from './social-icons';
import type {
  Align,
  BannerProps,
  BrandKit,
  BulletListProps,
  ButtonLinkProps,
  DataTableProps,
  DividerProps,
  IconRowProps,
  ImageBlockProps,
  LinkTextProps,
  LogoProps,
  SectionProps,
  SerializedNode,
  SerializedNodes,
  SpacerProps,
  TextProps,
} from './types';

/**
 * The serialised craft.js tree, turned into email HTML.
 *
 * This walks the node tree and emits table-based markup with inline CSS rather
 * than handing over the editor's own flexbox DOM. That is the whole point of
 * the exporter: the markup that survives Outlook, Gmail and the rest looks
 * nothing like the markup that is pleasant to edit, so the two are kept apart
 * and this function is the bridge.
 *
 * Nothing here adds an unsubscribe link or a `List-Unsubscribe` header. The
 * send pipeline does that for every message, so duplicating it here would put
 * two unsubscribe links in the same email.
 */

function esc(value: unknown): string {
  return String(value ?? '');
}

function attr(value: unknown): string {
  return String(value ?? '').replace(/"/g, '&quot;');
}

/**
 * A background, declared twice.
 *
 * The solid colour comes first and the gradient second, so a client that does
 * not understand `background-image` ignores that declaration and keeps the
 * colour rather than rendering nothing at all.
 */
function bgDecl(value: string): string {
  const fallback = firstColor(value);
  if (isGradient(value)) {
    return `background-color:${fallback};background-image:${value};background:${value};`;
  }
  return `background-color:${value};background:${value};`;
}

/** The legacy `bgcolor` attribute, which cannot express a gradient. */
function bgAttr(value: string): string {
  return isGradient(value) ? '' : ` bgcolor="${value}"`;
}

function fontDecl(fontFamily: string | undefined): string {
  return `font-family:${fontFamily || 'inherit'};`;
}

function componentType(node: SerializedNode): string | null {
  if (!node.type) return null;
  if (typeof node.type === 'string') return node.type;
  return node.type.resolvedName || null;
}

/* -- Per-block markup ------------------------------------------------------ */

function sectionHtml(p: SectionProps, innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${bgDecl(
    p.background,
  )}${sectionBorderCss(p)}"${bgAttr(p.background)}>
  <tr>
    <td style="padding:${p.paddingTop}px ${p.paddingX}px ${p.paddingBottom}px ${p.paddingX}px;">
      ${innerHtml}
    </td>
  </tr>
</table>`;
}

function bannerHtml(p: BannerProps): string {
  const brandNameHtml = p.showBrandName
    ? `<div style="font-size:20px;font-weight:700;color:${p.textColor};${fontDecl(
        p.fontFamily,
      )}letter-spacing:0.01em;margin-bottom:${p.showTagline ? 4 : 0}px;">${esc(p.brandName)}</div>`
    : '';

  const taglineHtml = p.showTagline
    ? `<div style="font-size:13px;color:${p.textColor};${fontDecl(p.fontFamily)}opacity:0.7;">${esc(
        p.tagline,
      )}</div>`
    : '';

  const minHeight = p.minHeight ? `min-height:${p.minHeight}px;` : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${bgDecl(
    p.background,
  )}"${bgAttr(p.background)}>
  <tr>
    <td style="text-align:${p.align};">
      <div style="position:relative;padding:${p.paddingY}px 24px;${minHeight}">
      ${brandNameHtml}
      ${taglineHtml}
      ${logoLayersHtml(p.logos)}
      </div>
    </td>
  </tr>
</table>`;
}

function textHtml(p: TextProps): string {
  const tagStyle =
    `margin:0;font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};` +
    `line-height:${p.lineHeight};${fontDecl(p.fontFamily)}`;

  const inner = `<${p.tag} style="${tagStyle}">${p.text}</${p.tag}>`;
  const body = p.href
    ? `<a href="${attr(p.href)}" target="_blank" style="color:inherit;text-decoration:none;">${inner}</a>`
    : inner;

  return `<div style="padding:${p.paddingY}px 0;text-align:${p.align};">
  ${body}
</div>`;
}

function buttonHtml(p: ButtonLinkProps): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:${p.paddingWrapperY}px 0;">
  <tr>
    <td style="text-align:${p.align};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${alignMargin(
        p.align,
      )};">
        <tr>
          <td style="${bgDecl(p.background)}border-radius:${p.borderRadius}px;text-align:center;"${bgAttr(
            p.background,
          )}>
            <a href="${attr(p.href)}" target="_blank" style="display:inline-block;padding:${p.paddingY}px ${
              p.paddingX
            }px;color:${p.color};font-size:${p.fontSize}px;font-weight:${
              p.fontWeight
            };text-decoration:none;${fontDecl(p.fontFamily)}">${p.text}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function linkHtml(p: LinkTextProps): string {
  return `<div style="padding:${p.paddingY}px 0;text-align:${p.align};">
  <a href="${attr(p.href)}" target="_blank" style="color:${p.color};font-size:${
    p.fontSize
  }px;text-decoration:${p.underline ? 'underline' : 'none'};${fontDecl(p.fontFamily)}">${p.text}</a>
</div>`;
}

function imageHtml(p: ImageBlockProps): string {
  if (!p.src) return '';

  const img = imageBlockImgHtml(p);
  const linked = p.href
    ? `<a href="${attr(
        p.href,
      )}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;border:0;">${img}</a>`
    : img;

  const layers = logoLayersHtml(p.logos);
  const inner = layers
    ? `<div style="position:relative;line-height:0;">
      ${linked}
      ${layers}
      </div>`
    : linked;

  return `<div style="padding:${p.paddingY}px 0;text-align:${p.align};">
  <div style="width:${p.width}%;margin:${alignMargin(p.align)};">
    ${inner}
  </div>
</div>`;
}

function iconRowHtml(p: IconRowProps): string {
  const radius = p.shape === 'circle' ? '50%' : p.shape === 'rounded' ? '8px' : '0px';
  const cellSize = p.size + 20;

  const chips = p.icons
    .map((icon) => {
      const custom = icon.platform === 'custom';
      if (custom && !icon.src) return '';

      const glyph = custom
        ? `<img src="${attr(icon.src)}" alt="${attr(icon.alt || '')}" width="${p.size}" height="${
            p.size
          }" style="display:inline-block;width:${p.size}px;height:${
            p.size
          }px;vertical-align:middle;border:0;" />`
        : socialIconSvgMarkup(icon.platform, p.size, p.iconColor);

      const chipBg = custom && icon.chip === false ? '' : bgDecl(p.background);
      const chip = `<span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;line-height:${cellSize}px;${chipBg}border-radius:${radius};text-align:center;text-decoration:none;">${glyph}</span>`;
      const body = icon.url
        ? `<a href="${attr(icon.url)}" target="_blank" style="text-decoration:none;">${chip}</a>`
        : chip;

      return body;
    })
    .filter(Boolean);

  // The canvas lays the chips out with a flex `gap`, which puts space between
  // them and none on the outside. Half the gap on each facing edge reproduces
  // that in table cells; padding the outer edges too would make the exported
  // row a whole gap wider than the one on screen.
  const cells = chips
    .map((body, index) => {
      const left = index === 0 ? 0 : p.gap / 2;
      const right = index === chips.length - 1 ? 0 : p.gap / 2;
      return `<td style="padding:0 ${right}px 0 ${left}px;">${body}</td>`;
    })
    .join('');

  return `<div style="padding:${p.paddingY}px 0;text-align:${p.align};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${alignMargin(
    p.align,
  )};">
    <tr>${cells}</tr>
  </table>
</div>`;
}

function dividerHtml(p: DividerProps): string {
  return `<div style="padding:${p.marginY}px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:${p.thickness}px solid ${p.color};font-size:0;line-height:0;">&nbsp;</td></tr></table></div>`;
}

function spacerHtml(p: SpacerProps): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${p.height}px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/**
 * A bullet list as a two-column table.
 *
 * Real `<ul>` markers are styled inconsistently across clients -- indented
 * differently, sometimes dropped entirely -- so the marker is drawn as text in
 * its own cell and the geometry becomes ours rather than the client's.
 */
function bulletListHtml(p: BulletListProps): string {
  const rows = p.items
    .map(
      (item, index) => `<tr>
        <td valign="top" style="width:${p.markerWidth}px;color:${p.markerColor};font-size:${
          p.fontSize
        }px;line-height:${p.lineHeight};padding-bottom:${
          p.itemSpacing
        }px;font-weight:600;">${markerFor(p.markerType, index, p.customMarker)}</td>
        <td valign="top" style="padding-bottom:${p.itemSpacing}px;color:${p.textColor};font-size:${
          p.fontSize
        }px;line-height:${p.lineHeight};">${item.text}</td>
      </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

function dataTableHtml(p: DataTableProps): string {
  const rows = p.cells
    .map((row, rowIndex) => {
      const isHeader = p.headerRow && rowIndex === 0;
      const isStriped = p.striped && !isHeader && rowIndex % 2 === 0;
      const bg = isHeader ? p.headerBg : isStriped ? p.stripedBg : p.cellBg;
      const color = isHeader ? p.headerColor : p.cellColor;

      const cells = row
        .map(
          (text) =>
            `<td style="${bgDecl(bg)}border:${p.borderWidth}px solid ${p.borderColor};padding:${
              p.cellPadding
            }px;color:${color};font-size:${p.fontSize}px;font-weight:${
              isHeader ? 700 : 400
            };text-align:left;vertical-align:top;"${bgAttr(bg)}>${text}</td>`,
        )
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`;
}

/* -- The walk -------------------------------------------------------------- */

function renderChildren(childIds: string[], nodes: SerializedNodes): string {
  return childIds.map((id) => renderNode(id, nodes)).join('\n');
}

/**
 * Narrowing happens here and only here.
 *
 * craft.js stores props as loose JSON, so each case asserts the shape its
 * block declares. Adding a prop to a block without declaring it in `types.ts`
 * therefore fails to compile here rather than rendering as `undefined` in a
 * sent email.
 */
function renderNode(id: string, nodes: SerializedNodes): string {
  const node = nodes[id];
  if (!node) return '';

  const type = componentType(node);
  const props = node.props ?? {};
  const children = node.nodes ?? [];

  switch (type) {
    case 'Section':
      return sectionHtml(props as unknown as SectionProps, renderChildren(children, nodes));
    case 'Banner':
      return bannerHtml(props as unknown as BannerProps);
    case 'Logo':
      return logoBlockHtml(props as unknown as LogoProps);
    case 'Text':
      return textHtml(props as unknown as TextProps);
    case 'ButtonLink':
      return buttonHtml(props as unknown as ButtonLinkProps);
    case 'LinkText':
      return linkHtml(props as unknown as LinkTextProps);
    case 'ImageBlock':
      return imageHtml(props as unknown as ImageBlockProps);
    case 'IconRow':
      return iconRowHtml(props as unknown as IconRowProps);
    case 'Divider':
      return dividerHtml(props as unknown as DividerProps);
    case 'Spacer':
      return spacerHtml(props as unknown as SpacerProps);
    case 'BulletList':
      return bulletListHtml(props as unknown as BulletListProps);
    case 'DataTable':
      return dataTableHtml(props as unknown as DataTableProps);
    default:
      return children.length ? renderChildren(children, nodes) : '';
  }
}

/* -- The document ---------------------------------------------------------- */

export interface ExportOptions {
  json: string | SerializedNodes;
  brand: BrandKit | null | undefined;
  subject?: string;
  preheader?: string;
}

export function exportToEmailHtml({
  json,
  brand,
  subject = 'Email preview',
  preheader = '',
}: ExportOptions): string {
  const nodes: SerializedNodes = typeof json === 'string' ? JSON.parse(json) : json;
  const body = renderNode('ROOT', nodes);
  const bg = brand?.backgroundColor || '#F3F2EF';
  const bodyFont = brand?.fontFamily || 'Helvetica, Arial, sans-serif';

  // Web fonts need both a <link> and an @import: between them they cover Apple
  // Mail, iOS, Outlook.com and most webmail. Everything else falls back to the
  // safe family at the end of each stack.
  const fontUrls = collectFontUrls(nodes, brand);
  const fontLinks = fontUrls.map((url) => `<link rel="stylesheet" href="${attr(url)}" />`).join('\n');
  const fontImports = fontUrls.map((url) => `@import url('${url}');`).join('\n  ');

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(subject)}</title>
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<style>
  table, td { border-collapse: collapse; }
</style>
<![endif]-->
${fontLinks}
<style>
  ${fontImports}
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; background: ${bg}; font-family: ${bodyFont}; }
  a { color: inherit; }
  @media screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .stack-col { display: block !important; width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:${bodyFont};">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>`
      : ''
  }
  <center style="width:100%;background:${bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" class="email-container" style="width:600px;max-width:600px;font-family:${bodyFont};">
            <tr>
              <td>
${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

export type { Align };
