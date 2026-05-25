import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL, SYSTEM_PROMPT } from './constants';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface MCPServer {
  type: 'url';
  url: string;
  name: string;
}

export async function callClaude(
  userMessage: string,
  mcpServers?: MCPServer[],
  maxTokens = 4000
): Promise<string> {
  // System prompt sent as a cache_control'd block — cached portion costs 10% of
  // normal input tokens on subsequent calls within the 5-min cache window.
  // For batch scans of 50 emails, the cached system prompt saves ~90% of cost.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };

  if (mcpServers?.length) {
    params.mcp_servers = mcpServers;
  }

  const response = await client.messages.create(params);

  // Collect all text blocks
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n');

  return text;
}

/** Extract a JSON array or object from a string. Strips markdown fences and tries both shapes. */
export function extractJSON<T>(text: string): T | null {
  // Strip ```json ... ``` fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1] ?? '', text];

  for (const source of candidates) {
    if (!source) continue;

    // Prefer whichever bracket type appears first
    const arrStart = source.indexOf('[');
    const objStart = source.indexOf('{');
    const tryOrder: Array<['[' | '{', ']' | '}']> =
      arrStart !== -1 && (objStart === -1 || arrStart < objStart)
        ? [['[', ']'], ['{', '}']]
        : [['{', '}'], ['[', ']']];

    for (const [open, close] of tryOrder) {
      const start = source.indexOf(open);
      if (start === -1) continue;
      const end = source.lastIndexOf(close);
      if (end <= start) continue;
      try {
        return JSON.parse(source.slice(start, end + 1)) as T;
      } catch {
        // try next shape
      }
    }
  }
  return null;
}
