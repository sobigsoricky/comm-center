import { NextResponse } from 'next/server';
import { disconnect, getStatus } from '@/lib/whatsapp';
import { appendLog } from '@/lib/memory-store';

// POST /api/whatsapp/disconnect → logs out, clears local session files
export async function POST() {
  try {
    await disconnect();
    appendLog('WhatsApp disconnected', 'info');
    return NextResponse.json(getStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
