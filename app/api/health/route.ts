import { NextResponse } from 'next/server';
import { isConnected as gmailConnected } from '@/lib/gmail';

// GET /api/health → quick readiness probe for monitoring + auto-start scripts.
// Returns 200 if everything is wired, 503 if something needs setup.
export async function GET() {
  const checks = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    googleConfig: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    gmail: false,
  };

  try {
    checks.gmail = await gmailConnected();
  } catch {
    checks.gmail = false;
  }

  const ready = checks.anthropic && checks.googleConfig && checks.gmail;
  return NextResponse.json(
    { ready, checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503 }
  );
}
