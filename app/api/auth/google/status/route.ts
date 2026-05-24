import { NextResponse } from 'next/server';
import { isConnected, clearTokens } from '@/lib/gmail';

// GET /api/auth/google/status → { connected: boolean }
export async function GET() {
  try {
    const connected = await isConnected();
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

// DELETE /api/auth/google/status → disconnect (clear tokens)
export async function DELETE() {
  await clearTokens();
  return NextResponse.json({ connected: false });
}
