/**
 * Template personalisation.
 *
 * Deliberately not a general-purpose template engine: the only construct is
 * `{{ variable }}`, with an optional `{{ variable | default }}` fallback. No
 * loops, no conditionals, no expression evaluation -- template bodies are
 * user-supplied, and an engine with an eval path would be a server-side
 * template injection hole.
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export type RecipientVariables = Record<string, string | number | boolean | null | undefined>;

export interface RenderContext extends RecipientVariables {
  email: string;
}

export interface RenderOptions {
  /** Escape substituted values for HTML contexts. Always true for HTML bodies. */
  escapeHtml?: boolean;
  /** Collects every variable the template referenced but the data did not fill. */
  onMissing?: (name: string) => void;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Case-insensitive, separator-insensitive key lookup so that a template written
 * as `{{storeName}}` still resolves a CSV column named `store_name`.
 */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '');
}

function buildLookup(context: RecipientVariables): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(context)) {
    if (rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue);
    if (value.length === 0) continue;
    lookup.set(normaliseKey(key), value);
  }
  return lookup;
}

export function renderTemplate(
  template: string,
  context: RecipientVariables,
  options: RenderOptions = {},
): string {
  const lookup = buildLookup(context);
  const { escapeHtml: shouldEscape = false, onMissing } = options;

  return template.replace(VARIABLE_PATTERN, (_match, rawName: string, fallback?: string) => {
    const resolved = lookup.get(normaliseKey(rawName));
    if (resolved === undefined) {
      if (fallback === undefined) onMissing?.(rawName);
      const value = fallback ?? '';
      return shouldEscape ? escapeHtml(value) : value;
    }
    return shouldEscape ? escapeHtml(resolved) : resolved;
  });
}

/** Every distinct variable name referenced by a template body. */
export function extractVariables(...sources: string[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      const name = match[1];
      if (name) found.add(name);
    }
  }
  return [...found].sort();
}

/**
 * Derives a readable text/plain alternative from an HTML body.
 *
 * Used only when the author did not supply their own plain-text version. A
 * multipart/alternative message without a real text part is a well-known
 * deliverability problem, so we always ship one.
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  /**
   * Keep the destination of links as "label <https://...>".
   *
   * The rendered form is parked in a placeholder rather than written inline,
   * because the tag-stripping pass below would otherwise treat the angle
   * brackets around the URL as a tag and delete the address.
   */
  const linkTexts: string[] = [];
  // The marker contains no angle brackets, so the tag-stripping pass below
  // cannot match it, and the whitespace cleanup cannot reshape it.
  const placeholder = (index: number) => `[[mailstrive:link:${index}]]`;

  text = text.replace(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const cleanLabel = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
      const rendered = !cleanLabel || cleanLabel === href ? href : `${cleanLabel} <${href}>`;
      linkTexts.push(rendered);
      return placeholder(linkTexts.length - 1);
    },
  );

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|tr|h[1-6]|li|table|section|header|footer)>/gi, '\n\n');
  text = text.replace(/<li\b[^>]*>/gi, '  * ');
  text = text.replace(/<hr\s*\/?>/gi, '\n----------\n');
  text = text.replace(/<[^>]+>/g, '');

  text = decodeEntities(text);

  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');

  // Restore links last, so the URLs are never touched by the cleanup passes.
  text = text.replace(/\[\[mailstrive:link:(\d+)\]\]/g, (_match, index: string) => linkTexts[Number(index)] ?? '');

  return text.trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}
