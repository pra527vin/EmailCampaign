import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Typefaces are self-hosted by `next/font`, so there is no request to Google at
 * page load and no flash of fallback text. Plus Jakarta Sans carries the UI;
 * IBM Plex Mono is reserved for the things that must be copied exactly -- DNS
 * records, merge variables, message IDs.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MailStrive',
    template: '%s · MailStrive',
  },
  description: 'Permission-based bulk email campaign management.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Tints the browser chrome on mobile to match the sidebar.
  themeColor: '#0B2436',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
