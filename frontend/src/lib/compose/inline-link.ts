'use client';

/**
 * Inline hyperlinks inside a contenteditable block.
 *
 * The problem this solves: clicking into the settings panel destroys the text
 * selection, so by the time the "add link" button is pressed there is nothing
 * selected to wrap. Each block therefore remembers its last non-empty
 * selection while it is being edited, and the panel restores that range before
 * wrapping or unwrapping the anchor.
 *
 * `document.execCommand` is formally deprecated, but it remains the only thing
 * every browser implements for editing a live contenteditable range, and the
 * result is handed straight back as HTML so the block's `text` prop stays the
 * single source of truth.
 */

interface Remembered {
  el: HTMLElement;
  range: Range;
}

const remembered = new Map<string, Remembered>();

export function rememberSelection(nodeId: string, el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;
  remembered.set(nodeId, { el, range: range.cloneRange() });
}

export function forgetSelection(nodeId: string): void {
  remembered.delete(nodeId);
}

function anchorAt(range: Range): HTMLAnchorElement | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  return node ? (node as Element).closest('a') : null;
}

export interface SelectionInfo {
  hasSelection: boolean;
  text: string;
  href: string;
}

/** What the settings panel needs to render its hyperlink controls. */
export function selectionInfo(nodeId: string): SelectionInfo {
  const entry = remembered.get(nodeId);
  if (!entry || !entry.el.isConnected) return { hasSelection: false, text: '', href: '' };

  const { range } = entry;
  return {
    hasSelection: !range.collapsed,
    text: range.toString(),
    href: anchorAt(range)?.getAttribute('href') ?? '',
  };
}

function restore(nodeId: string): Remembered | null {
  const entry = remembered.get(nodeId);
  if (!entry || !entry.el.isConnected) return null;

  const selection = window.getSelection();
  if (!selection) return null;

  entry.el.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(entry.range);
  return entry;
}

function styleAnchors(el: HTMLElement, color: string | undefined, underline: boolean): void {
  el.querySelectorAll('a').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    if (color) anchor.style.color = color;
    anchor.style.textDecoration = underline ? 'underline' : 'none';
  });
}

/**
 * Wrap the remembered selection in an anchor.
 * Returns the block's new HTML, or `null` when there was nothing to link.
 */
export function applyInlineLink(
  nodeId: string,
  href: string,
  { color, underline = true }: { color?: string; underline?: boolean } = {},
): string | null {
  const entry = restore(nodeId);
  if (!entry) return null;

  const { el, range } = entry;
  if (range.collapsed) return null;

  document.execCommand('createLink', false, href);
  styleAnchors(el, color, underline);
  rememberSelection(nodeId, el);
  return el.innerHTML;
}

/** Unwrap any anchor touching the remembered selection. */
export function removeInlineLink(nodeId: string): string | null {
  const entry = restore(nodeId);
  if (!entry) return null;

  const { el, range } = entry;
  const anchor = anchorAt(range);

  // A caret resting inside a link selects nothing, so `unlink` would be a
  // no-op. Select the whole anchor first and it becomes the obvious action.
  if (anchor && range.collapsed) {
    const selection = window.getSelection();
    const whole = document.createRange();
    whole.selectNodeContents(anchor);
    selection?.removeAllRanges();
    selection?.addRange(whole);
  }

  document.execCommand('unlink');
  rememberSelection(nodeId, el);
  return el.innerHTML;
}
