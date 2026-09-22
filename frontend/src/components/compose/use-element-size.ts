'use client';

import { useEffect, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The rendered size of a block, kept current as it changes.
 *
 * Measured rather than calculated: a banner's height is the sum of its
 * padding, its text, whichever web font finished loading and any minimum it
 * was given, and only the browser knows that total.
 *
 * `offsetWidth`/`offsetHeight` rather than `getBoundingClientRect`, because
 * the canvas is scaled with CSS `zoom` and a bounding box reports the zoomed
 * number. These two stay in the element's own pixels, which is what someone
 * sizing artwork for the email actually needs.
 */
export function useElementSize(element: HTMLElement | null | undefined): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);

  useEffect(() => {
    if (!element) {
      setSize(null);
      return undefined;
    }

    const measure = (): void =>
      setSize((current) =>
        current?.width === element.offsetWidth && current.height === element.offsetHeight
          ? current
          : { width: element.offsetWidth, height: element.offsetHeight },
      );

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}
