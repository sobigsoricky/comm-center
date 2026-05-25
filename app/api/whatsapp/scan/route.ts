import { NextResponse } from 'next/server';
import { callClaude, extractJSON } from '@/lib/claude';
import { drainWaInbound, upsertDraft, appendLog } from '@/lib/memory-store';
import { getStatus } from '@/lib/whatsapp';
import { Draft } from '@/lib/types';

interface ClaudeReply {
  priority?: string;
  draftPreview?: string;
  fullDraft?: string;
}

const PARALLEL = 5;

// POST /api/whatsapp/scan → drafts replies for all queued WhatsApp messages
export async function POST() {
  try {
    if (getStatus().state !== 'connected') {
      return NextResponse.json(
        { drafts: [], error: 'WhatsApp not connected.' },
        { status: 401 }
      );
    }

    const queued = drainWaInbound();
    if (queued.length === 0) {
      return NextResponse.json({ drafts: [] });
    }

    const drafts: Draft[] = [];
    for (let i = 0; i < queued.length; i += PARALLEL) {
      const batch = queued.slice(i, i + PARALLEL);
      const results = await Promise.all(
        batch.map(async (msg): Promise<Draft | null> => {
          try {
            const reply = await draftReply(msg.contactName, msg.message);
            const draft: Draft = {
              id: `wa_${msg.whatsappMessageId}`,
              channel: 'whatsapp',
              from: msg.jid, // we keep the JID here so /send can target it
              subject: `WhatsApp — ${msg.contactName}`,
              receivedAt: msg.receivedAt,
              createdAt: new Date().toISOString(),
              snippet: msg.message.slice(0, 80),
              originalMessage: msg.message,
              priority: reply.priority,
              status: 'pending',
              gmailDraftId: null,
              draftPreview: reply.draftPreview,
              fullDraft: reply.fullDraft,
            };
            upsertDraft(draft);
            return draft;
          } catch (err) {
            console.error('[whatsapp/scan] error:', err);
            return null;
          }
        })
      );
      for (const d of results) if (d) drafts.push(d);
    }

    appendLog(`WhatsApp scan: ${drafts.length} drafts ready`, 'success');
    return NextResponse.json({ drafts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ drafts: [], error: message }, { status: 500 });
  }
}

async function draftReply(
  contactName: string,
  message: string
): Promise<{ priority: Draft['priority']; draftPreview: string; fullDraft: string }> {
  const prompt = `Draft a WhatsApp reply for a message received from ${contactName}.

Message received:
"""
${message}
"""

Return ONLY a raw JSON object (no markdown fences, no explanation):
{
  "priority": "high | medium | low based on urgency",
  "draftPreview": "first 120 characters of your reply",
  "fullDraft": "complete WhatsApp reply — conversational tone, no formal sign-off"
}`;

  const text = await callClaude(prompt);
  const raw = extractJSON<ClaudeReply>(text);

  if (!raw?.fullDraft) {
    throw new Error('Claude did not return a valid draft');
  }

  const priority = (
    ['high', 'medium', 'low'].includes(raw.priority ?? '') ? raw.priority : 'medium'
  ) as Draft['priority'];

  return {
    priority,
    draftPreview: raw.draftPreview ?? raw.fullDraft.slice(0, 120),
    fullDraft: raw.fullDraft,
  };
}
