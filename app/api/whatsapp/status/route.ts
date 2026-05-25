import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/whatsapp';

// GET /api/whatsapp/status → { state, qr?, phone? }
export async function GET() {
  const s = getStatus();
  return NextResponse.json(s, { headers: { 'Cache-Control': 'no-store' } });
}
