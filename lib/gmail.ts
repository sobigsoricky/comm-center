import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { promises as fs } from 'fs';
import path from 'path';
import { GOOGLE_OAUTH, GMAIL_SCOPES, TOKEN_FILE } from './google-config';

// ── Token persistence ────────────────────────────────────────────
// Stored at <cwd>/.tokens/google.json. gitignored.

function tokenPath(): string {
  return path.join(process.cwd(), TOKEN_FILE);
}

async function readTokens(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(tokenPath(), 'utf8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

async function writeTokens(tokens: Credentials): Promise<void> {
  await fs.mkdir(path.dirname(tokenPath()), { recursive: true });
  await fs.writeFile(tokenPath(), JSON.stringify(tokens, null, 2), 'utf8');
}

export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(tokenPath());
  } catch {
    // ignore
  }
}

// ── OAuth client ─────────────────────────────────────────────────

function newOAuthClient(): OAuth2Client {
  if (!GOOGLE_OAUTH.clientId || !GOOGLE_OAUTH.clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env.local — run /setup'
    );
  }
  return new google.auth.OAuth2(
    GOOGLE_OAUTH.clientId,
    GOOGLE_OAUTH.clientSecret,
    GOOGLE_OAUTH.redirectUri
  );
}

export function getAuthUrl(): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // ← required to get a refresh_token
    prompt: 'consent', // ← force consent so refresh_token is returned every time
    scope: GMAIL_SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token. Revoke this app at myaccount.google.com/permissions and try again.'
    );
  }
  await writeTokens(tokens);
}

/**
 * Returns an authenticated OAuth client, or null if not connected.
 * Auto-refreshes the access token if expired.
 */
export async function getAuthedClient(): Promise<OAuth2Client | null> {
  const tokens = await readTokens();
  if (!tokens?.refresh_token) return null;

  const client = newOAuthClient();
  client.setCredentials(tokens);

  // Persist any refreshed access_token automatically.
  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await writeTokens(merged);
  });

  return client;
}

export async function isConnected(): Promise<boolean> {
  const client = await getAuthedClient();
  if (!client) return false;
  try {
    // Quick ping — fetches the profile, cheap call.
    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch {
    return false;
  }
}

// ── Gmail operations ─────────────────────────────────────────────

export interface ParsedMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string; // ISO
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function decodeBase64Url(data: string): string {
  // Gmail uses URL-safe base64
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractPlainBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  // Prefer text/plain part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && payload.parts.length > 0) {
    // Recurse, prefer text/plain
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return extractPlainBody(plain);

    // Fall back to nested multipart
    for (const part of payload.parts) {
      const found = extractPlainBody(part);
      if (found) return found;
    }
  }

  // Last resort: top-level body even if not text/plain
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ''); // crude HTML strip
  }

  return '';
}

export async function fetchUnreadMessages(limit: number): Promise<ParsedMessage[]> {
  const client = await getAuthedClient();
  if (!client) throw new Error('Gmail not connected. Click "Connect Gmail" first.');

  const gmail = google.gmail({ version: 'v1', auth: client });

  // List unread message IDs in inbox
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: limit,
  });

  const ids = list.data.messages?.map((m) => m.id!).filter(Boolean) ?? [];
  if (ids.length === 0) return [];

  // Fetch each in parallel
  const detailed = await Promise.all(
    ids.map((id) =>
      gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      })
    )
  );

  return detailed.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers;
    const internalDate = msg.internalDate ? Number(msg.internalDate) : Date.now();

    return {
      id: msg.id ?? '',
      threadId: msg.threadId ?? '',
      from: headerValue(headers, 'From'),
      subject: headerValue(headers, 'Subject') || '(no subject)',
      snippet: msg.snippet ?? '',
      body: extractPlainBody(msg.payload ?? undefined).slice(0, 8000), // cap to keep prompts sane
      receivedAt: new Date(internalDate).toISOString(),
    };
  });
}

/**
 * Save a reply as a Gmail draft on the given thread.
 * Returns the draft ID.
 */
export async function createDraftReply(args: {
  threadId: string;
  to: string; // original sender's "From" header verbatim
  subject: string; // original subject (without Re: — we add it)
  bodyText: string;
}): Promise<string> {
  const client = await getAuthedClient();
  if (!client) throw new Error('Gmail not connected.');

  const gmail = google.gmail({ version: 'v1', auth: client });

  const subjectWithRe = /^re:/i.test(args.subject) ? args.subject : `Re: ${args.subject}`;

  // Build RFC 2822 message
  const lines = [
    `To: ${args.to}`,
    `Subject: ${subjectWithRe}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    args.bodyText,
  ];
  const raw = Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        threadId: args.threadId,
        raw,
      },
    },
  });

  return res.data.id ?? '';
}
