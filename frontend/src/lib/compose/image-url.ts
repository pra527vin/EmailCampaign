/**
 * Turns what people actually paste into a link a browser -- and a mail client
 * -- can load as an image.
 *
 * The common failures are all the same shape: a share *page* rather than the
 * file itself, a missing scheme, and stray quotes dragged along by a copy out
 * of some other tool. Each is cheap to repair here and expensive to debug once
 * it is sitting in a sent campaign as a broken image.
 */

const DRIVE_FILE = /^https?:\/\/(?:drive|docs)\.google\.com\/file\/d\/([\w-]+)/i;
const DRIVE_OPEN = /^https?:\/\/(?:drive|docs)\.google\.com\/(?:open|uc)\?[^#]*\bid=([\w-]+)/i;
const DROPBOX = /^https?:\/\/(?:www\.)?dropbox\.com\//i;
const GITHUB_BLOB = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i;

/** Looks like a host and path that someone forgot to put a scheme on. */
function schemeless(value: string): boolean {
  if (/^[a-z][\w+.-]*:/i.test(value)) return false;
  if (value.startsWith('//') || value.startsWith('/')) return false;
  return /^(?:www\.[^\s/]+|[\w-]+(?:\.[\w-]+)+\/)/i.test(value);
}

export function normalizeImageUrl(raw: unknown): string {
  let value = String(raw ?? '').trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;

  // Quotes and angle brackets a copy-paste dragged along.
  value = value
    .replace(/^['"<(]+/, '')
    .replace(/['">)]+$/, '')
    .trim();
  if (!value) return '';

  if (schemeless(value)) value = `https://${value}`;

  // Google Drive share link -> the file itself.
  const drive = value.match(DRIVE_FILE) ?? value.match(DRIVE_OPEN);
  if (drive?.[1]) return `https://drive.google.com/uc?export=view&id=${drive[1]}`;

  // Dropbox share link -> the raw file.
  if (DROPBOX.test(value)) {
    const raised = value
      .replace(/([?&])dl=0\b/i, '$1raw=1')
      .replace(/([?&])dl=1\b/i, '$1raw=1');
    if (/[?&](raw|dl)=/i.test(value)) return raised;
    return `${raised}${value.includes('?') ? '&' : '?'}raw=1`;
  }

  // GitHub blob page -> raw content.
  const gh = value.match(GITHUB_BLOB);
  if (gh?.[1] && gh[2] && gh[3]) {
    return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
  }

  return value;
}

/** True when the value is something a browser can try to load. */
export function isLoadableImageUrl(value: string): boolean {
  return /^(https?:\/\/|data:image\/)/i.test(value.trim());
}

/** True for a link the browser has to fetch from another origin. */
export function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * The same image, fetched through this app's own server.
 *
 * Used only for the canvas preview, when a host refuses to serve the file to
 * the browser. Blocks always keep the original URL, and that is what the
 * exported email carries -- the proxy never ends up in a sent message.
 */
export function proxiedImageUrl(value: string): string {
  return `/compose-image?url=${encodeURIComponent(value.trim())}`;
}
