import { NextRequest, NextResponse } from 'next/server';
import { callClaude, extractJSON } from '@/lib/claude';
import { Draft, DraftWhatsAppRequest, DraftWhatsAppResponse } from '@/lib/types';

interface RawWADraft {
  priority?: string;
  draftPreview?: string;
  fullDraft?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<DraftWhatsAppResponse>> {
  try {
    const body: DraftWhatsAppRequest = await req.json();
    const { contact, message, context } = body;

    if (!contact?.trim() || !message?.trim()) {
      return NextResponse.json(
        { draft: {} as Draft, error: 'contact and message are required' },
        { status: 400 }
      );
    }

    const uid = `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    const prompt = `Draft a WhatsApp reply for a message received from ${contact}.

Message received:
"""
${message}
"""
${context?.trim() ? `Additional context: ${context.trim()}` : ''}

Return ONLY a raw JSON object (no markdown fences, no explanation):
{
  "priority": "high | medium | low based on urgency of the message",
  "draftPreview": "first 120 characters of your reply",
  "fullDraft": "complete WhatsApp reply — conversational tone, no formal sign-off needed"
}`;

    const text = await callClaude(prompt);
    const raw = extractJSON<RawWADraft>(text);

    if (!raw?.fullDraft) {
      throw new Error('AI did not return a valid draft');
    }

    const draft: Draft = {
      id: uid,
      channel: 'whatsapp',
      from: contact,
      subject: `WhatsApp — ${contact}`,
      receivedAt: now,
      createdAt: now,
      snippet: message.slice(0, 80),
      originalMessage: message,
      priority: (['high', 'medium', 'low'].includes(raw.priority ?? '') ? raw.priority : 'medium') as Draft['priority'],
      status: 'pending',
      gmailDraftId: null,
      draftPreview: raw.draftPreview ?? raw.fullDraft.slice(0, 120),
      fullDraft: raw.fullDraft,
    };

    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[draft-whatsapp]', message);
    return NextResponse.json({ draft: {} as Draft, error: message }, { status: 500 });
  }
}
