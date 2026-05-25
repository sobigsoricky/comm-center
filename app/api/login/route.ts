import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'cc_auth';

async function hash(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// POST /api/login { password } → set auth cookie if it matches APP_PASSWORD
export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: 'APP_PASSWORD not configured on server' }, { status: 503 });
  }

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* keep empty */
  }

  if (!body.password || body.password !== password) {
    // Brief delay to discourage brute force (poor man's rate limit)
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await hash(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

// DELETE /api/login → clear cookie (logout)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
