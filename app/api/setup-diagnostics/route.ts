import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

type HealthLevel = 'healthy' | 'setup_required' | 'error';

interface DiagnosticItem {
  key: string;
  label: string;
  level: HealthLevel;
  detail: string;
  stepId: string;
  action: string;
  reason: string;
}

interface DiagnosticsResponse {
  summary: {
    healthy: number;
    setup_required: number;
    error: number;
  };
  checks: DiagnosticItem[];
  checkedAt: string;
}

const ROOT = process.cwd();
const COMM_ENV_PATH = path.join(ROOT, '.env.local');
const WA_ENV_PATH = path.join(ROOT, '..', 'whatsapp-bot', '.env');
const WA_AUTH_PATH = path.join(ROOT, '..', 'whatsapp-bot', 'auth');
const WA_NODE_MODULES_PATH = path.join(ROOT, '..', 'whatsapp-bot', 'node_modules');
const GMAIL_TOKEN_PATH = path.join(ROOT, '.tokens', 'google.json');

function parseEnv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirWithFiles(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function isPortOpen(url: string, timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse<DiagnosticsResponse>> {
  const checks: DiagnosticItem[] = [];

  const commEnvExists = await exists(COMM_ENV_PATH);
  const waEnvExists = await exists(WA_ENV_PATH);
  const waNodeModulesExists = await exists(WA_NODE_MODULES_PATH);
  const waAuthExists = await isDirWithFiles(WA_AUTH_PATH);
  // This route executing successfully implies Comm Center runtime is healthy.
  const commServerOpen = true;
  const waPort = waEnvExists ? parseEnv(await fs.readFile(WA_ENV_PATH, 'utf8')).PORT ?? '3001' : '3001';
  const waServerOpen = await isPortOpen(`http://localhost:${waPort}/api/status`);

  const commEnv = parseEnv(commEnvExists ? await fs.readFile(COMM_ENV_PATH, 'utf8') : '');
  const waEnv = parseEnv(waEnvExists ? await fs.readFile(WA_ENV_PATH, 'utf8') : '');

  // Effective values: env vars (Railway/Vercel/etc.) take precedence, fall back to .env.local file.
  const isCloud = !commEnvExists && Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL || process.env.RENDER);
  const sourceLabel = (fromProcess: boolean) =>
    fromProcess ? 'platform env vars' : '.env.local file';

  const commKey = process.env.ANTHROPIC_API_KEY || commEnv.ANTHROPIC_API_KEY;
  const commKeyFromProcess = Boolean(process.env.ANTHROPIC_API_KEY);
  const googleId = process.env.GOOGLE_CLIENT_ID || commEnv.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET || commEnv.GOOGLE_CLIENT_SECRET;
  const googleFromProcess = Boolean(process.env.GOOGLE_CLIENT_ID);

  // On cloud platforms, the .env.local file isn't expected — skip that check entirely.
  if (!isCloud) {
    checks.push({
      key: 'comm-env',
      label: 'Comm Center config',
      level: commEnvExists ? 'healthy' : 'error',
      detail: commEnvExists ? '.env.local found' : '.env.local missing in comm-center app',
      stepId: 'keys',
      action: 'Open step 1 and save API configuration',
      reason: commEnvExists ? 'Configuration file is present.' : 'The app cannot read key values until .env.local exists.',
    });
  }

  checks.push({
    key: 'comm-key',
    label: 'Comm Center API key',
    level: commKey ? 'healthy' : 'error',
    detail: commKey
      ? `Anthropic key configured (from ${sourceLabel(commKeyFromProcess)})`
      : 'ANTHROPIC_API_KEY is missing — set in Railway/Vercel env vars or .env.local',
    stepId: 'keys',
    action: 'Add ANTHROPIC_API_KEY to your platform env vars',
    reason: commKey
      ? 'API key was detected.'
      : 'Scan/draft API routes require ANTHROPIC_API_KEY.',
  });

  const googleClientConfigured = Boolean(googleId && googleSecret);
  const gmailTokenExists = await exists(GMAIL_TOKEN_PATH);
  checks.push({
    key: 'gmail-oauth-config',
    label: 'Gmail OAuth credentials',
    level: googleClientConfigured ? 'healthy' : 'setup_required',
    detail: googleClientConfigured
      ? `GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set (from ${sourceLabel(googleFromProcess)})`
      : 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — set in your platform env vars',
    stepId: 'gmail',
    action: 'Follow SETUP.md to create Google OAuth credentials',
    reason: googleClientConfigured
      ? 'OAuth credentials detected.'
      : 'Without these, the Connect Gmail button cannot start the OAuth flow.',
  });

  checks.push({
    key: 'gmail-connected',
    label: 'Gmail account linked',
    level: gmailTokenExists ? 'healthy' : 'setup_required',
    detail: gmailTokenExists
      ? 'Refresh token stored at .tokens/google.json'
      : 'No refresh token saved — click Connect Gmail',
    stepId: 'gmail',
    action: 'Open Gmail step and click Connect Gmail',
    reason: gmailTokenExists
      ? 'Authorization completed; scans will use stored token.'
      : 'Scan Gmail cannot run until a refresh token exists.',
  });

  // WhatsApp bot + local-runtime checks only apply when running locally.
  if (!isCloud) {
    checks.push({
      key: 'wa-env',
      label: 'WhatsApp bot config (optional)',
      level: waEnvExists ? 'healthy' : 'setup_required',
      detail: waEnvExists ? '.env found for whatsapp-bot' : '.env missing — bot is optional, skip if not using it',
      stepId: 'keys',
      action: 'Open step 1 and save bot configuration',
      reason: waEnvExists ? 'Bot configuration file is present.' : 'Bot reads runtime values from whatsapp-bot/.env.',
    });

    checks.push({
      key: 'wa-key',
      label: 'WhatsApp bot API key (optional)',
      level: waEnv.ANTHROPIC_API_KEY ? 'healthy' : 'setup_required',
      detail: waEnv.ANTHROPIC_API_KEY
        ? 'Anthropic key configured for bot drafting'
        : 'ANTHROPIC_API_KEY is missing in whatsapp-bot/.env',
      stepId: 'keys',
      action: 'Enter WhatsApp bot key in step 1 and save',
      reason: waEnv.ANTHROPIC_API_KEY
        ? 'API key was detected in bot env.'
        : 'Bot cannot generate replies without ANTHROPIC_API_KEY.',
    });

    checks.push({
      key: 'wa-install',
      label: 'WhatsApp bot dependencies (optional)',
      level: waNodeModulesExists ? 'healthy' : 'setup_required',
      detail: waNodeModulesExists ? 'node_modules present in whatsapp-bot' : 'Dependencies may not be installed yet',
      stepId: 'bot-install',
      action: 'Go to install step and run dependency commands',
      reason: waNodeModulesExists
        ? 'Dependencies folder exists.'
        : 'whatsapp-bot/node_modules was not found.',
    });

    checks.push({
      key: 'wa-auth',
      label: 'WhatsApp Web authentication (optional)',
      level: waAuthExists ? 'healthy' : 'setup_required',
      detail: waAuthExists ? 'Saved auth session found (QR setup done)' : 'No saved auth found; run node setup.js',
      stepId: 'wa-auth',
      action: 'Open auth step and run node setup.js to scan QR',
      reason: waAuthExists
        ? 'Auth directory contains saved session files.'
        : 'whatsapp-bot/auth is missing or empty.',
    });
  }

  const commPort = process.env.PORT ?? '3002';
  checks.push({
    key: 'comm-runtime',
    label: 'Comm Center runtime',
    level: commServerOpen ? 'healthy' : 'error',
    detail: commServerOpen
      ? isCloud ? 'App live on cloud platform' : `App reachable on localhost:${commPort}`
      : `Dev server may not be running on :${commPort}`,
    stepId: 'comm-center',
    action: 'Open app runtime step and start npm run dev',
    reason: commServerOpen
      ? 'This diagnostics endpoint is currently serving, so app runtime is live.'
      : 'Server route did not confirm app runtime.',
  });

  if (!isCloud) {
    checks.push({
      key: 'wa-runtime',
      label: 'WhatsApp bot runtime (optional)',
      level: waServerOpen ? 'healthy' : 'setup_required',
      detail: waServerOpen
        ? `Bot dashboard/API reachable on localhost:${waPort}`
        : `Bot not reachable on :${waPort} (start node index.js)`,
      stepId: 'run-bot',
      action: 'Open run-bot step and start node index.js',
      reason: waServerOpen
        ? 'HTTP status check succeeded for bot status endpoint.'
        : `GET http://localhost:${waPort}/api/status did not return success.`,
    });
  }

  const summary = checks.reduce(
    (acc, item) => {
      acc[item.level] += 1;
      return acc;
    },
    { healthy: 0, setup_required: 0, error: 0 }
  );

  return NextResponse.json({ summary, checks, checkedAt: new Date().toISOString() });
}
