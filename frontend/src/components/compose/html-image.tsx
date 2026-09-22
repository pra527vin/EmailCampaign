'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Draws a block from its own exported markup.
 *
 * The point is fidelity: what the canvas shows is the exact tags and inline
 * styles the email will carry, not a React approximation of them. An image
 * that looks right while composing therefore cannot arrive wrong.
 *
 * The markup comes from this application's own builders in `lib/compose`, not
 * from anything a recipient or an upload supplied, and the URLs inside it are
 * attribute-escaped where they are built. Because the browser is handed a
 * plain string rather than elements, the load and error listeners have to be
 * wired up by hand.
 */
export function HtmlImage({
  html,
  onLoad,
  onError,
  style,
  className,
}: {
  html: string;
  onLoad?: () => void;
  onError?: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = ref.current?.querySelector('img');
    if (!img) return undefined;

    // A cached image can already be finished before the listeners attach, and
    // a complete image with no intrinsic width is a failed one.
    if (img.complete) {
      if (img.naturalWidth > 0) onLoad?.();
      else onError?.();
      return undefined;
    }

    const handleLoad = () => onLoad?.();
    const handleError = () => onError?.();
    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    return () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [html, onLoad, onError]);

  if (!html) return null;

  return (
    <div ref={ref} style={style} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
