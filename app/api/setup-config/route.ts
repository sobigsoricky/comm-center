import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface SetupConfigResponse {
  commCenter: {
    hasEnvLocal: boolean;
    hasAnthropicKey: boolean;
  };
  whatsappBot: {
    hasEnv: boolean;
    hasAnthropicKey: boolean;
    port: string;
    pollIntervalMs: string;
  };
}

interface SetupConfigUpdate {
  commCenterAnthropicKey?: string;
  whatsappAnthropicKey?: string;
  whatsappPort?: string;
  whatsappPollIntervalMs?: string;
}

const ROOT = process.cwd();
const COMM_ENV_PATH = path.join(ROOT, '.env.local');
const WHATSAPP_ENV_PATH = path.join(ROOT, '..', 'whatsapp-bot', '.env');

function parseEnv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function serializeEnv(values: Record<string, string>): string {
  return `${Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')}\n`;
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse<SetupConfigResponse>> {
  const [commEnvRaw, waEnvRaw] = await Promise.all([readIfExists(COMM_ENV_PATH), readIfExists(WHATSAPP_ENV_PATH)]);
  const commEnv = parseEnv(commEnvRaw ?? '');
  const waEnv = parseEnv(waEnvRaw ?? '');

  return NextResponse.json({
    commCenter: {
      hasEnvLocal: commEnvRaw !== null,
      hasAnthropicKey: Boolean(commEnv.ANTHROPIC_API_KEY),
    },
    whatsappBot: {
      hasEnv: waEnvRaw !== null,
      hasAnthropicKey: Boolean(waEnv.ANTHROPIC_API_KEY),
      port: waEnv.PORT ?? '3001',
      pollIntervalMs: waEnv.POLL_INTERVAL_MS ?? '8000',
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<{ ok: true } | { ok: false; error: string }>> {
  try {
    const body = (await req.json()) as SetupConfigUpdate;

    const commEnvRaw = (await readIfExists(COMM_ENV_PATH)) ?? '';
    const waEnvRaw = (await readIfExists(WHATSAPP_ENV_PATH)) ?? '';
    const commEnv = parseEnv(commEnvRaw);
    const waEnv = parseEnv(waEnvRaw);

    if (body.commCenterAnthropicKey !== undefined) {
      commEnv.ANTHROPIC_API_KEY = body.commCenterAnthropicKey.trim();
    }
    if (body.whatsappAnthropicKey !== undefined) {
      waEnv.ANTHROPIC_API_KEY = body.whatsappAnthropicKey.trim();
    }
    if (body.whatsappPort !== undefined) {
      waEnv.PORT = body.whatsappPort.trim() || '3001';
    }
    if (body.whatsappPollIntervalMs !== undefined) {
      waEnv.POLL_INTERVAL_MS = body.whatsappPollIntervalMs.trim() || '8000';
    }

    await Promise.all([
      fs.writeFile(COMM_ENV_PATH, serializeEnv(commEnv), 'utf8'),
      fs.writeFile(WHATSAPP_ENV_PATH, serializeEnv(waEnv), 'utf8'),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
