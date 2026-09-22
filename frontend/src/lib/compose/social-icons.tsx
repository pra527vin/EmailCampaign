/**
 * Simplified glyphs for the common social and contact channels.
 *
 * Deliberately a generic pictogram set drawn as single-colour paths, not a
 * reproduction of any brand's logo artwork -- the chip behind them carries the
 * colour, so one path serves every palette.
 *
 * Each glyph exists twice over: a React component for the canvas, and a markup
 * string for the export. An email cannot carry React and the canvas should not
 * be handed raw HTML, but both read the same path data, so the two can never
 * drift apart.
 */

export const SOCIAL_PLATFORMS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'website', label: 'Website' },
  { value: 'email', label: 'Email' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X / Twitter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'snapchat', label: 'Snapchat' },
  { value: 'threads', label: 'Threads' },
];

export const SOCIAL_ICON_PATHS: Record<string, string> = {
  website:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1.2 0 2.5 1.8 3.1 4.6H8.9C9.5 5.8 10.8 4 12 4zM8.5 8.6h7c.2.9.3 1.9.3 2.9s-.1 2-.3 2.9h-7c-.2-.9-.3-1.9-.3-2.9s.1-2 .3-2.9zM6.8 8.6c-.2.9-.3 1.9-.3 2.9s.1 2 .3 2.9H4.3a8.03 8.03 0 0 1 0-5.8h2.5zm.6 7.7h5.5c-.6 2.8-1.9 4.6-3.1 4.6s-2.5-1.8-3.1-4.6zm6.1 4.2c1-.9 1.9-2.4 2.4-4.2h2.3a8.04 8.04 0 0 1-4.7 4.2zm2.4-6.1c.2-.9.3-1.9.3-2.9s-.1-2-.3-2.9h2.5a8.03 8.03 0 0 1 0 5.8h-2.5zm-.2-7.7c-.5-1.8-1.4-3.3-2.4-4.2a8.04 8.04 0 0 1 4.7 4.2h-2.3zM7.9 4.5c-1 .9-1.9 2.4-2.4 4.2H3.2a8.04 8.04 0 0 1 4.7-4.2zM3.2 16.3h2.3c.5 1.8 1.4 3.3 2.4 4.2a8.04 8.04 0 0 1-4.7-4.2z',
  email:
    'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.4 2 7.1 6.1a.8.8 0 0 0 1 0L19.6 7H4.4zM4 8.4V17h16V8.4l-6.9 5.9a2.8 2.8 0 0 1-3.6 0L4 8.4z',
  facebook:
    'M13.5 21v-7.6h2.6l.4-3h-3v-1.9c0-.9.2-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.2H7.8v3h2.7V21h3z',
  instagram:
    'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8zm4 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zm5-3.3a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  x: 'M4 4h4.6l4 5.4L17.2 4H20l-6.2 7.5L20.4 20h-4.6l-4.4-5.9L5.9 20H3.1l6.6-8L4 4z',
  linkedin:
    'M6.9 8.4H3.6V20h3.3V8.4zM5.3 3.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM20.4 20h-3.3v-6c0-1.4 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V20H9.5V8.4h3.2v1.6h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V20z',
  youtube:
    'M21.6 7.5s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C15.9 4.3 12 4.3 12 4.3s-3.9 0-6.7.2c-.4 0-1.3.1-2.1.9-.6.6-.8 2.1-.8 2.1S2.2 9.3 2.2 11v1.9c0 1.7.2 3.5.2 3.5s.2 1.5.8 2.1c.8.8 1.8.8 2.3.9 1.6.2 6.5.2 6.5.2s3.9 0 6.7-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.2-1.7.2-3.5V11c0-1.7-.2-3.5-.2-3.5zM9.9 14.6V8.9l5.4 2.9-5.4 2.8z',
  pinterest:
    'M12 3a9 9 0 0 0-3.3 17.4c0-.7-.1-1.9.1-2.6l1.3-5.6s-.3-.7-.3-1.6c0-1.5.9-2.6 1.9-2.6.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.5-.3 1.1.5 1.9 1.5 1.9 1.8 0 3.1-2.3 3.1-5 0-2.1-1.5-3.6-4.1-3.6-3 0-4.7 2.2-4.7 4.4 0 .9.3 1.8.8 2.4.1.1.1.2.1.3-.1.4-.3 1.1-.3 1.3-.1.2-.2.3-.4.2-1.4-.6-2.1-2.4-2.1-3.9 0-2.9 2.4-6.4 7.1-6.4 3.8 0 6.3 2.7 6.3 5.6 0 3.9-2.1 6.7-5.2 6.7-1 0-2-.6-2.3-1.2l-.7 2.6c-.2.9-.7 1.9-1.1 2.6A9 9 0 1 0 12 3z',
  tiktok:
    'M14.5 3h2.6c.1 1.3.6 2.4 1.4 3.2.8.8 1.9 1.3 3.1 1.4v2.6c-1.4 0-2.8-.4-4-1.2v6.4c0 3.1-2.5 5.6-5.6 5.6S6.4 18.5 6.4 15.4c0-3 2.4-5.5 5.4-5.6v2.7a2.9 2.9 0 1 0 2.7 2.9V3z',
  whatsapp:
    'M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 0 1 6.8 12.2.9.9 0 0 0-.1.7l.9 3.2-3.3-.9a.9.9 0 0 0-.6.1A8 8 0 1 1 12 4zm-3.5 3.8c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.1 1.8 2.9 4.4 3.9 2.2.9 2.6.7 3.1.6.5 0 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.6-1.5-1.9-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.9-2-.2-.5-.4-.5-.6-.5z',
  telegram:
    'M21.9 4.3 18.8 20c-.2 1-.9 1.2-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L18 7.2c.4-.3-.1-.5-.6-.2L6.7 13.6l-4.7-1.5c-1-.3-1-1 .2-1.5L20.6 3.5c.8-.3 1.6.2 1.3 1z',
  snapchat:
    'M12 2.5c2.6 0 4.6 2.1 4.5 4.9l-.1 2c0 .3.2.4.4.5.3.1 1 .2 1.4-.2.2-.2.5-.2.7-.1.3.1.4.4.3.7-.2.6-1 1.1-2.2 1.5-.1.4 0 .8.3 1.4.6 1.3 1.7 2 3.1 2.3.2 0 .4.3.3.6-.2.7-1.4 1.1-2.9 1.3-.1.2-.2.6-.3.9-.1.3-.3.4-.7.4-.6 0-1.1.2-1.9.6-.7.3-1.5.7-2.6.7s-1.9-.4-2.6-.7c-.8-.4-1.3-.6-1.9-.6-.4 0-.6-.1-.7-.4-.1-.3-.2-.7-.3-.9-1.5-.2-2.7-.6-2.9-1.3-.1-.3.1-.6.3-.6 1.4-.3 2.5-1 3.1-2.3.3-.6.4-1 .3-1.4-1.2-.4-2-.9-2.2-1.5-.1-.3 0-.6.3-.7.2-.1.5-.1.7.1.4.4 1.1.3 1.4.2.2-.1.4-.2.4-.5l-.1-2c-.1-2.8 1.9-4.9 4.5-4.9z',
  threads:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.6 9.2c-.1-2.1-1.3-3.4-3.4-3.5-1.2 0-2.3.5-2.9 1.5l1.1.7c.4-.6 1-.9 1.8-.9 1.2 0 1.9.6 2.1 1.7-.5-.1-1.1-.2-1.7-.1-1.7.1-2.9 1.1-2.8 2.6.1 1.4 1.4 2.3 3 2.2 1.9-.1 2.9-1.4 3.1-3 .5.3.9.8 1.1 1.3l1.2-.5c-.3-.9-.9-1.6-1.6-2zm-2.6 3.4c-.8.1-1.5-.3-1.6-.9-.1-.6.5-1.1 1.4-1.2.5 0 1 0 1.5.2 0 .9-.4 1.8-1.3 1.9z',
};

function pathFor(platform: string): string {
  return SOCIAL_ICON_PATHS[platform] ?? SOCIAL_ICON_PATHS['website'] ?? '';
}

export function SocialIconSvg({
  platform,
  size = 18,
  color = '#FFFFFF',
}: {
  platform: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={pathFor(platform)} fill={color} />
    </svg>
  );
}

/** The same glyph as markup, for the exported email. */
export function socialIconSvgMarkup(platform: string, size: number, color: string): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg"><path d="${pathFor(platform)}" fill="${color}"/></svg>`
  );
}
