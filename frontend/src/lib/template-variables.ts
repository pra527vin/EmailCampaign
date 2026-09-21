/**
 * The `{{variables}}` a template body references.
 *
 * Mirrors `extractVariables` in the shared render module deliberately. The
 * stored list is derived on the server at save time; this one only drives the
 * editor's live chips, and a preview that disagreed with what gets stored would
 * be worse than showing nothing at all. If the two ever diverge, the server is
 * right — it is what a campaign actually renders from.
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*(?:\|[^}]*?)?\}\}/g;

/**
 * Every distinct variable name across the given sources, sorted.
 *
 * `unsubscribe_url` is dropped for the same reason the server drops it: every
 * message carries one regardless, so listing it tells the author nothing and
 * implies a merge field they have to supply.
 */
export function extractTemplateVariables(...sources: string[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      if (match[1] && match[1] !== 'unsubscribe_url') found.add(match[1]);
    }
  }
  return [...found].sort();
}
