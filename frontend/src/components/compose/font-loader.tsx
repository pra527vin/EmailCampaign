'use client';

import { useEditor } from '@craftjs/core';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBrandKit } from '@/lib/compose/brand-kit';
import { collectFontUrls } from '@/lib/compose/fonts';

/**
 * Loads the stylesheets for every web or custom font the design uses, so the
 * canvas shows the same faces the exported email links to.
 *
 * Rendered into `document.head` through a portal rather than as a `<link>` in
 * the tree, because a stylesheet link is only honoured there. `head` is held
 * in state so the portal is created after mount -- there is no document to
 * portal into while the page is still being rendered on the server.
 */
export function FontLoader() {
  const { brand } = useBrandKit();
  const { nodes } = useEditor((state) => ({ nodes: state.nodes }));
  const [head, setHead] = useState<HTMLHeadElement | null>(null);

  useEffect(() => setHead(document.head), []);

  const urls = useMemo(() => collectFontUrls(nodes, brand), [nodes, brand]);

  if (!head) return null;

  return createPortal(
    urls.map((url) => <link key={url} rel="stylesheet" href={url} />),
    head,
  );
}
