import { NextResponse } from 'next/server';
import { startSession, getStatus } from '@/lib/whatsapp';
import { appendLog } from '@/lib/memory-store';

// POST /api/whatsapp/connect → starts a session, returns current status
// (status will be 'connecting' or 'qr' immediately; client polls /status for the QR string)
export async function POST() {
  try {
    appendLog('WhatsApp connect initiated', 'info');
    // Fire-and-forget. startSession sets state synchronously to 'connecting',
    // then 'qr' / 'connected' arrive on the event bus as Baileys progresses.
    void startSession().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      appendLog(`WhatsApp connect failed: ${msg}`, 'error');
    });
    // Give Baileys a moment to set initial state
    await new Promise((r) => setTimeout(r, 100));
    return NextResponse.json(getStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ state: 'disconnected', error: message }, { status: 500 });
  }
}
