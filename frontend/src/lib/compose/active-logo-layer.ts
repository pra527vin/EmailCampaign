/**
 * Which logo layer the arrow keys move -- a single slot shared by every Banner
 * and Image block on the canvas.
 *
 * Clicking a layer claims it; clicking anywhere else, pressing Escape, or the
 * layer being removed releases it. A layer id is already unique across the
 * whole canvas, so the owning block never needs to be tracked here: each
 * layer stack just checks whether the active id is one of its own.
 *
 * This is a module-level store rather than context because the keyboard
 * handler is global -- routing it through React would mean every block
 * re-rendering on every arrow press.
 */

type Listener = (id: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

export function setActiveLogoLayerId(id: string | null): void {
  if (activeId === id) return;
  activeId = id || null;
  listeners.forEach((fn) => fn(activeId));
}

export function getActiveLogoLayerId(): string | null {
  return activeId;
}

export function subscribeActiveLogoLayerId(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
