import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Fetches an image server-side so the composer can show it.
 *
 * A browser cannot load many perfectly good image URLs from another site:
 * hosts check the Referer, serve only to their own pages, or redirect to a
 * viewer page. The server has no such restrictions, so the canvas asks for the
 * picture through here instead. This is for the preview only -- the block
 * keeps the original URL, and that is what the exported email carries.
 *
 * It lives at `/compose-image` rather than under `/api`, because
 * `next.config.mjs` rewrites every `/api/*` path to the backend.
 *
 * Being a server that fetches a URL someone else chose, this is an SSRF
 * surface, and the guards below are the whole point of the route:
 *
 *  - only `http:` and `https:`, so `file:` and the rest cannot be reached;
 *  - every resolved address checked against private and link-local space, so
 *    it cannot be pointed at localhost or the cloud metadata endpoint;
 *  - a timeout, a size cap, and a content-type check, so it cannot be used to
 *    stream something large or to fetch non-image content;
 *  - `nosniff` on the way out, so a mislabelled body is not re-interpreted.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Local addresses are reachable in development, where they are often the point. */
const ALLOW_LOCAL = process.env.NODE_ENV !== 'production';

const fail = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** Loopback, private and link-local space -- never fetched in production. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === undefined || b === undefined) return true;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;

  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped?.[1] ? isPrivateIp(mapped[1]) : false;
}

async function hostAllowed(hostname: string): Promise<boolean> {
  if (ALLOW_LOCAL) return true;
  if (net.isIP(hostname)) return !isPrivateIp(hostname);

  try {
    // Every address, not just the first: a host that resolves to one public
    // and one private address must still be refused.
    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateIp(entry.address));
  } catch {
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return fail(400, 'Missing url');

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return fail(400, 'Not a URL');
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return fail(400, 'Only http and https URLs can be fetched');
  }
  if (!(await hostAllowed(target.hostname))) return fail(403, 'That address is not allowed');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some hosts serve a viewer page unless a browser-ish client asks.
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
    });
  } catch (error) {
    return fail(
      502,
      error instanceof Error && error.name === 'AbortError'
        ? 'The host took too long'
        : 'Could not reach that host',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) return fail(502, `The host answered ${upstream.status}`);

  const type = (upstream.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!type.startsWith('image/')) {
    return fail(415, `That link is ${type || 'not an image'} — it points at a page, not an image file`);
  }

  // Checked twice over: the declared length first, so an oversized body can be
  // refused before it is read, and the real length after, because the header
  // is only a claim.
  const declared = Number(upstream.headers.get('content-length') ?? 0);
  if (declared && declared > MAX_BYTES) return fail(413, 'That image is too large');

  const body = new Uint8Array(await upstream.arrayBuffer());
  if (body.length > MAX_BYTES) return fail(413, 'That image is too large');

  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
