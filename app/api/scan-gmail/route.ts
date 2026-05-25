import { NextRequest, NextResponse } from 'next/server';
import { callClaude, extractJSON } from '@/lib/claude';
import {
  fetchPendingThreads,
  createDraftReply,
  isConnected,
  type ParsedMessage,
  type TimeRange,
} from '@/lib/gmail';
import { Draft, ScanGmailResponse } from '@/lib/types';

interface ClaudeReply {
  priority?: string;
  draftPreview?: string;
  fullDraft?: string;
}

interface ScanRequest {
  range?: TimeRange;
  pendingOnly?: boolean;
  max?: number;
}

// Hard caps (so a fat-fingered request can't burn $$)
const HARD_MAX = 50;
const PARALLEL = 5; // concurrent Claude calls

export async function POST(req: NextRequest): Promise<NextResponse<ScanGmailResponse>> {
  try {
    // Parse body (safe even if empty / wrong content-type)
    let body: ScanRequest = {};
    try {
      body = (await req.json()) as ScanRequest;
    } catch {
      // empty body is fine — use defaults
    }

    const range: TimeRange = body.range ?? '30d';
    const pendingOnly = body.pendingOnly ?? true;
    const max = Math.max(1, Math.min(HARD_MAX, body.max ?? 10));

    if (!(await isConnected())) {
      return NextResponse.json(
        { drafts: [], error: 'Gmail not connected. Click "Connect Gmail" to authorize.' },
        { status: 401 }
      );
    }

    const messages = await fetchPendingThreads({ range, max, pendingOnly });
    if (messages.length === 0) return NextResponse.json({ drafts: [] });

    // Process in parallel batches to control concurrency
    const drafts: Draft[] = [];
    for (let i = 0; i < messages.length; i += PARALLEL) {
      const batch = messages.slice(i, i + PARALLEL);
      const results = await Promise.all(
        batch.map(async (msg): Promise<Draft | null> => {
          try {
            const reply = await draftReplyForEmail(msg);
            const gmailDraftId = await createDraftReply({
              threadId: msg.threadId,
              to: msg.from,
              subject: msg.subject,
              bodyText: reply.fullDraft,
            });
            return buildDraft(msg, reply, gmailDraftId);
          } catch (err) {
            console.error('[scan-gmail] per-message error:', msg.id, err);
            return null;
          }
        })
      );
      for (const d of results) if (d) drafts.push(d);
    }

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
