'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { isRemoteImageUrl, proxiedImageUrl } from '@/lib/compose/image-url';

export type ImageStatus = 'empty' | 'loading' | 'ok' | 'error';

export interface ResolvedImage {
  status: ImageStatus;
  resolved: string;
  /** True once the picture is coming through this app rather than directly. */
  viaServer: boolean;
  imgKey: string;
  imgProps: ImgHTMLAttributes<HTMLImageElement>;
}

/**
 * Resolves an image URL for the canvas.
 *
 * The browser tries the link itself first. If the host refuses it -- hotlink
 * protection, a redirect without CORS, a viewer page rather than a file -- the
 * same URL is fetched again through this app's server so the picture still
 * appears while composing.
 *
 * The block always keeps the original URL, so the proxy is a preview aid and
 * never reaches a sent email.
 */
export function useResolvedImage(src: string | undefined): ResolvedImage {
  const clean = typeof src === 'string' ? src.trim() : '';
  const remote = isRemoteImageUrl(clean);

  // 0 = the link as given, 1 = the same link through this app's server.
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ImageStatus>(clean ? 'loading' : 'empty');

  useEffect(() => {
    setAttempt(0);
    setStatus(clean ? 'loading' : 'empty');
  }, [clean]);

  const onLoad = useCallback(() => setStatus('ok'), []);

  const onError = useCallback(() => {
    if (remote && attempt === 0) {
      setAttempt(1);
      setStatus('loading');
      return;
    }
    setStatus('error');
  }, [remote, attempt]);

  const resolved = !clean ? '' : attempt === 0 || !remote ? clean : proxiedImageUrl(clean);

  return {
    status,
    resolved,
    viaServer: attempt > 0,
    // A fresh element per attempt, so a stale error never lands on the next
    // one. Kept apart from `imgProps` because React reads `key` only as a real
    // JSX attribute, never when it arrives through a spread.
    imgKey: `${clean}#${attempt}`,
    imgProps: {
      src: resolved,
      referrerPolicy: 'no-referrer',
      onLoad,
      onError,
    },
  };
}
