'use client';

import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export const ZOOM_STEPS = [0.4, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

const MIN = ZOOM_STEPS[0];
const MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1] as number;

const clamp = (zoom: number): number => Math.min(MAX, Math.max(MIN, zoom));

export interface ZoomState {
  zoom: number;
  stepBy: (direction: 1 | -1) => void;
  reset: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

/**
 * Canvas zoom: Ctrl/Cmd with the wheel over the canvas, Ctrl/Cmd +, - and 0,
 * or the control in the canvas header.
 *
 * `attachRef` is a callback ref rather than a ref object so the wheel listener
 * still finds the canvas when it mounts on a later render -- which it does,
 * because nothing renders until the saved design has been read.
 */
export function useZoom(): ZoomState & { attachRef: (node: HTMLElement | null) => void } {
  const [zoom, setZoom] = useState(1);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  const attachRef = useCallback((node: HTMLElement | null) => setScroller(node), []);

  // Steps rather than a smooth ramp, so the keyboard lands on round numbers.
  const stepBy = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      if (direction > 0) {
        const next = ZOOM_STEPS.find((step) => step > current + 0.001);
        return next ?? MAX;
      }
      const below = [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001);
      return below ?? MIN;
    });
  }, []);

  const reset = useCallback(() => setZoom(1), []);

  useEffect(() => {
    if (!scroller) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // Without this the browser zooms the whole page instead.
      event.preventDefault();
      setZoom((current) => clamp(current * (event.deltaY > 0 ? 0.92 : 1.08)));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [scroller]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        stepBy(1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        stepBy(-1);
      } else if (event.key === '0') {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepBy, reset]);

  return {
    zoom,
    stepBy,
    reset,
    attachRef,
    canZoomIn: zoom < MAX - 0.001,
    canZoomOut: zoom > MIN + 0.001,
  };
}

export function ZoomControl({ zoom, stepBy, reset, canZoomIn, canZoomOut }: ZoomState) {
  const button =
    'flex h-7 w-7 items-center justify-center rounded-[7px] text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => stepBy(-1)}
        disabled={!canZoomOut}
        title="Zoom out (Ctrl -)"
        className={button}
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        onClick={reset}
        title="Reset to 100% (Ctrl 0)"
        className="min-w-[52px] rounded-[7px] px-1.5 py-1 text-2xs font-semibold tabular-nums text-slate-900 transition-colors hover:bg-slate-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => stepBy(1)}
        disabled={!canZoomIn}
        title="Zoom in (Ctrl +)"
        className={button}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
