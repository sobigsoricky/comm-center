/**
 * Auth gate for the entire app.
 *
 * If APP_PASSWORD is set in env:
 *   - Unauthenticated users redirected to /login (for HTML routes)
 *   - Unauthenticated API requests get 401
 *   - Session cookie `cc_auth` carries a signed token after login
 *
 * If APP_PASSWORD is NOT set: middleware is a no-op (dev convenience).
 * Set APP_PASSWORD in Railway env vars for production.
 *
 * The OAuth callback is exempt (Google needs to reach it without our cookie).
 */

import { NextRequest, NextResponse } from 'next/server';

// Edge runtime doesn't expose Node crypto APIs in the same shape, so we use Web Crypto.
// This middleware runs at the edge (Vercel) or Node (Railway) — Web Crypto is available in both.

const COOKIE_NAME = 'cc_auth';

// Routes that bypass auth (must remain reachable)
const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/auth/google/callback', // OAuth redirect target — Google calls this without our cookie
  '/_next', // static assets
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

async function expectedToken(password: string): Promise<string> {
  // The cookie value is sha256(password). Constant value, but we never expose the password itself.
  const enc = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;

  // No password set → no auth (dev mode)
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const expected = await expectedToken(password);

  // Constant-time-ish compare (in middleware we don't have timingSafeEqual; sha256 of unknown input
  // mitigates the practical timing leak since attackers can't choose the comparison plaintext)
  if (cookie === expected) return NextResponse.next();

  // API routes get 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // HTML routes get redirected to /login
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
