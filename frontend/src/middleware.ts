import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'mailstrive_session';

/**
 * Edge gate for dashboard routes.
 *
 * This only checks that a session cookie is present -- it is a redirect
 * convenience, not an authorisation boundary. Every request that matters is
 * still authenticated by the API against a live session row; a forged cookie
 * gets past this middleware and straight into a 401.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/lists/:path*',
    '/templates/:path*',
    '/campaigns/:path*',
    '/send/:path*',
    '/settings/:path*',
  ],
};
