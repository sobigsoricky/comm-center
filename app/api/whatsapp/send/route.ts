import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, getStatus } from '@/lib/whatsapp';
import { appendLog, getDraft, markDraftSent } from '@/lib/memory-store';

interface SendRequest {
  draftId?: string;
  // OR direct send (skip draft store):
  jid?: string;
  text?: string;
}

// POST /api/whatsapp/send  { draftId } | { jid, text }
export async function POST(req: NextRequest) {
  try {
    const body: SendRequest = await req.json().catch(() => ({}));

    if (getStatus().state !== 'connected') {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 });
    }

    // Path 1: send a draft by ID
    if (body.draftId) {
      const draft = getDraft(body.draftId);
      if (!draft) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      }
      if (draft.channel !== 'whatsapp') {
        return NextResponse.json({ error: 'Not a WhatsApp draft' }, { status: 400 });
      }
      // We stored the JID-ish identifier on `from`; for v1 we require the `from` field
      // to actually be the JID (Baileys gives us this). If you sourced the draft from
      // the +WhatsApp manual form, `from` is the contact name and we can't auto-send.
      const target = draft.from;
      if (!target.includes('@')) {
        return NextResponse.json(
          { error: 'Manual drafts have no WhatsApp ID — use the bot or paste the chat first' },
          { status: 400 }
        );
      }
      await sendMessage(target, draft.fullDraft);
      markDraftSent(draft.id);
      appendLog(`Sent WhatsApp to ${draft.from}`, 'success');
      return NextResponse.json({ ok: true });
    }

    // Path 2: ad-hoc send
    if (body.jid && body.text) {
      await sendMessage(body.jid, body.text);
      appendLog(`Sent WhatsApp to ${body.jid}`, 'success');
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Provide draftId or {jid, text}' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
