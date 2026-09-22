'use client';

import dynamic from 'next/dynamic';

/**
 * The visual composer.
 *
 * Loaded with `ssr: false` because craft.js reads the DOM to drive its
 * drag-and-drop, and the canvas restores a design from IndexedDB -- neither of
 * which exists on the server. Rendering it there would only produce markup the
 * client immediately throws away.
 */
const EmailEditor = dynamic(
  () => import('@/components/compose/email-editor').then((module) => module.EmailEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Loading the composer&hellip;
      </div>
    ),
  },
);

export default function ComposePage() {
  return (
    // A fixed height rather than page flow: the composer is a three-column
    // workspace with its own scrolling regions, so it needs to know how tall
    // it is. The minimum keeps it usable on a short window.
    //
    // No border, radius or shadow: AppShell gives this route the full
    // viewport with no gutter, so a "card" here would just be a box floating
    // with nothing around it to separate it from. Below `lg` the mobile
    // header is still visible (`AppShell`'s sidebar only shows at `lg`), so
    // the height is the viewport minus that header; at `lg` and up there is
    // no header left to subtract.
    <div className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col overflow-hidden bg-white lg:h-screen">
      <EmailEditor />
    </div>
  );
}
