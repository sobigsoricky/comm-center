import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/gmail';

// GET /api/auth/google → redirect to Google's consent screen
export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
