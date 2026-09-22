import { idbDelete, idbGet, idbSet } from './idb';

/**
 * The composed design in progress: the craft.js node tree plus the two fields
 * that travel with it.
 *
 * This is a working draft, not the saved artefact. A design only becomes part
 * of the system when it is saved as a template; until then it lives in the
 * browser so a reload -- or a wander off to another page -- does not lose an
 * afternoon's work.
 */

export const DOC_KEY = 'current-design';
export const DOC_VERSION = 1;

export interface StoredDesign {
  version: number;
  craft: string;
  subject: string;
  preheader: string;
  savedAt: string;
}

/** An empty email body: what a reset leaves behind. */
export const EMPTY_DOC = JSON.stringify({
  ROOT: {
    type: { resolvedName: 'Section' },
    isCanvas: true,
    props: { background: '#FFFFFF', paddingTop: 24, paddingBottom: 24, paddingX: 0 },
    displayName: 'Section',
    custom: { displayName: 'Email body' },
    parent: null,
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
});

/**
 * Whether a stored tree can still be deserialised.
 *
 * A design saved by an older build can name a block this one no longer has.
 * craft.js throws on that, taking the whole page with it, so the tree is
 * checked against the live resolver up front and a stale one is discarded
 * instead.
 */
export function isRestorable(craftJson: unknown, resolver: Record<string, unknown>): boolean {
  if (typeof craftJson !== 'string' || !craftJson.trim()) return false;

  let tree: unknown;
  try {
    tree = JSON.parse(craftJson);
  } catch {
    return false;
  }

  if (!tree || typeof tree !== 'object') return false;
  const nodes = tree as Record<string, { type?: { resolvedName?: string } }>;
  if (!nodes['ROOT']) return false;

  return Object.values(nodes).every((node) => {
    const name = node?.type?.resolvedName;
    return typeof name === 'string' && Object.prototype.hasOwnProperty.call(resolver, name);
  });
}

export async function loadDesign(resolver: Record<string, unknown>): Promise<StoredDesign | null> {
  const doc = (await idbGet(DOC_KEY)) as StoredDesign | undefined;
  if (!doc || doc.version !== DOC_VERSION) return null;
  if (!isRestorable(doc.craft, resolver)) return null;
  return doc;
}

export function saveDesign(design: {
  craft: string;
  subject: string;
  preheader: string;
}): Promise<boolean> {
  return idbSet(DOC_KEY, { version: DOC_VERSION, ...design, savedAt: new Date().toISOString() });
}

export function clearDesign(): Promise<void> {
  return idbDelete(DOC_KEY);
}
