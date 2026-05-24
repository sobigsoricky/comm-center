import { NextRequest, NextResponse } from 'next/server';
import { callClaude, extractJSON } from '@/lib/claude';
import { RedraftRequest, RedraftResponse } from '@/lib/types';

interface RawRedraft {
  fullDraft?: string;
  draftPreview?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<RedraftResponse>> {
  try {
    const body: RedraftRequest = await req.json();
    const { currentDraft, from, subject, instruction } = body;

    if (!currentDraft?.trim() || !instruction?.trim()) {
      return NextResponse.json(
        { fullDraft: '', draftPreview: '', error: 'currentDraft and instruction are required' },
        { status: 400 }
      );
    }

    const prompt = `Revise the following draft based on the instruction provided.

CURRENT DRAFT:
---
${currentDraft}
---
Context: From ${from} | Subject: ${subject}

REVISION INSTRUCTION: "${instruction}"

Return ONLY a raw JSON object (no markdown fences, no explanation):
{
  "fullDraft": "complete revised draft",
  "draftPreview": "first 120 characters of the revised draft"
}`;

    const text = await callClaude(prompt);
    const raw = extractJSON<RawRedraft>(text);

    if (!raw?.fullDraft) {
      throw new Error('AI did not return a valid revised draft');
    }

    return NextResponse.json({
      fullDraft: raw.fullDraft,
      draftPreview: raw.draftPreview ?? raw.fullDraft.slice(0, 120),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[redraft]', message);
    return NextResponse.json({ fullDraft: '', draftPreview: '', error: message }, { status: 500 });
  }
}
