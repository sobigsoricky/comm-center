import { NextResponse } from 'next/server';
import { callClaude, extractJSON } from '@/lib/claude';
import { fetchUnreadMessages, createDraftReply, isConnected, type ParsedMessage } from '@/lib/gmail';
import { MAX_EMAILS_PER_SCAN } from '@/lib/google-config';
import { Draft, ScanGmailResponse } from '@/lib/types';

interface ClaudeReply {
  priority?: string;
  draftPreview?: string;
  fullDraft?: string;
}

export async function POST(): Promise<NextResponse<ScanGmailResponse>> {
  try {
    // 1. Verify connection
    const connected = await isConnected();
    if (!connected) {
      return NextResponse.json(
        { drafts: [], error: 'Gmail not connected. Click "Connect Gmail" to authorize.' },
        { status: 401 }
      );
    }

    // 2. Fetch unread emails directly via Gmail API
    const messages = await fetchUnreadMessages(MAX_EMAILS_PER_SCAN);

    if (messages.length === 0) {
      return NextResponse.json({ drafts: [] });
    }

    // 3. For each email, ask Claude to draft a reply, then save as Gmail draft
    const drafted = await Promise.all(
      messages.map(async (msg) => {
        try {
          const reply = await draftReplyForEmail(msg);
          const draftId = await createDraftReply({
            threadId: msg.threadId,
            to: msg.from,
            subject: msg.subject,
            bodyText: reply.fullDraft,
          });
          return buildDraft(msg, reply, draftId);
        } catch (err) {
          console.error('[scan-gmail] per-message error:', msg.id, err);
          return null;
        }
      })
    );

    const drafts = drafted.filter((d): d is Draft => d !== null);
    return NextResponse.json({ drafts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scan-gmail]', message);
    return NextResponse.json({ drafts: [], error: message }, { status: 500 });
  }
}

async function draftReplyForEmail(
  msg: ParsedMessage
): Promise<{ priority: Draft['priority']; draftPreview: string; fullDraft: string }> {
  const prompt = `Draft a reply to the email below. Use my identity, knowledge of clients, and the rules in the system prompt.

FROM: ${msg.from}
SUBJECT: ${msg.subject}
RECEIVED: ${msg.receivedAt}

EMAIL BODY:
"""
${msg.body || msg.snippet}
"""

Return ONLY a raw JSON object (no markdown fences, no explanation):
{
  "priority": "high | medium | low",
  "draftPreview": "first 120 characters of your reply",
  "fullDraft": "complete email reply, ready to send, including a sign-off"
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

function buildDraft(
  msg: ParsedMessage,
  reply: { priority: Draft['priority']; draftPreview: string; fullDraft: string },
  gmailDraftId: string
): Draft {
  return {
    id: msg.id, // stable Gmail message ID — re-scans dedupe naturally
    channel: 'email',
    from: msg.from || 'Unknown Sender',
    subject: msg.subject,
    receivedAt: msg.receivedAt,
    createdAt: new Date().toISOString(),
    snippet: msg.snippet,
    priority: reply.priority,
    status: 'pending',
    gmailMessageId: msg.id,
    gmailDraftId,
    draftPreview: reply.draftPreview,
    fullDraft: reply.fullDraft,
  };
}
