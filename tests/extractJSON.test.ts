import { describe, it, expect } from 'vitest';
import { extractJSON } from '@/lib/claude';

describe('extractJSON — happy paths', () => {
  it('parses a plain JSON object', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a plain JSON array', () => {
    expect(extractJSON('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON inside ```json fences', () => {
    expect(extractJSON('```json\n{"x":42}\n```')).toEqual({ x: 42 });
  });

  it('parses JSON inside ``` fences without language tag', () => {
    expect(extractJSON('```\n{"x":42}\n```')).toEqual({ x: 42 });
  });

  it('strips leading prose', () => {
    const txt = 'Sure thing! Here is the JSON:\n{"draft": "ok"}';
    expect(extractJSON(txt)).toEqual({ draft: 'ok' });
  });

  it('strips trailing prose', () => {
    const txt = '{"draft": "ok"}\n\nHope this helps!';
    expect(extractJSON(txt)).toEqual({ draft: 'ok' });
  });

  it('handles nested objects', () => {
    expect(extractJSON('{"a":{"b":{"c":1}}}')).toEqual({ a: { b: { c: 1 } } });
  });

  it('handles strings with embedded braces', () => {
    expect(extractJSON('{"text":"hello {world}"}')).toEqual({ text: 'hello {world}' });
  });
});

describe('extractJSON — edge cases', () => {
  it('returns null for empty string', () => {
    expect(extractJSON('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(extractJSON('   \n\t  ')).toBeNull();
  });

  it('returns null when no brackets at all', () => {
    expect(extractJSON('this is just prose, no json here')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractJSON('{"a": 1,')).toBeNull();
  });

  it('returns null for unclosed object', () => {
    expect(extractJSON('{"a": "no closer"')).toBeNull();
  });

  it('handles JSON containing markdown-looking content', () => {
    const result = extractJSON('{"text":"```code```"}');
    expect(result).toEqual({ text: '```code```' });
  });

  it('parses when bracket appears in prose before the actual JSON', () => {
    // This is a known weakness — bracket-in-prose can confuse parsing.
    // The function tries both shapes so we should still succeed for the JSON portion.
    const result = extractJSON('e.g. [example] becomes {"answer": "ok"}');
    expect(result).toEqual({ answer: 'ok' });
  });

  it('prefers array when array comes first', () => {
    const result = extractJSON<unknown[]>('[1,2,3] and also {"x":1}');
    expect(result).toEqual([1, 2, 3]);
  });

  it('falls back to object if array fails', () => {
    // The "[broken" shouldn't break us — fall through to object
    const result = extractJSON('garbage [not valid json {"ok": true}');
    expect(result).toEqual({ ok: true });
  });
});

describe('extractJSON — Claude-realistic outputs', () => {
  it('handles a typical email-draft response', () => {
    const claude = `\`\`\`json
{
  "priority": "high",
  "draftPreview": "Hi Liber, thanks for the message...",
  "fullDraft": "Hi Liber,\\n\\nThanks for the message. I'll review and revert by tomorrow.\\n\\nBest,\\nPranay"
}
\`\`\``;
    const result = extractJSON<{ priority: string; fullDraft: string }>(claude);
    expect(result?.priority).toBe('high');
    expect(result?.fullDraft).toContain('Pranay');
  });

  it('handles a multi-draft scan response', () => {
    const claude = `[
  {"id": "msg_1", "priority": "high"},
  {"id": "msg_2", "priority": "low"}
]`;
    const result = extractJSON<Array<{ id: string }>>(claude);
    expect(result).toHaveLength(2);
    expect(result?.[0].id).toBe('msg_1');
  });

  it('survives Claude prefixing with "I will return..."', () => {
    const claude = `I will return the JSON now:

{"draft": "Sure, sounds good."}`;
    expect(extractJSON(claude)).toEqual({ draft: 'Sure, sounds good.' });
  });
});
