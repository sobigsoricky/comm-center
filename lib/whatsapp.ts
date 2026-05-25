/**
 * WhatsApp session manager — lazy-loaded Baileys WebSocket client.
 *
 * Lifecycle:
 *   startSession()  — boots Baileys, returns immediately; QR available shortly after
 *   getStatus()     — current state (disconnected | qr | connecting | connected | logged_out)
 *   disconnect()    — logs out, clears session files
 *   sendMessage()   — sends a message on the active session
 *
 * Persistence: auth state is written to /data/whatsapp-session via Baileys'
 * useMultiFileAuthState. Survives container restarts.
 *
 * Memory: lives in module-scope singleton (stored on globalThis for HMR).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { appendLog, enqueueWaMessage } from './memory-store';
import { eventBus } from './event-bus';

// Baileys exports are namespaced — we import lazily to avoid loading on routes that don't need it
type Baileys = typeof import('@whiskeysockets/baileys');
let baileysMod: Baileys | null = null;
async function loadBaileys(): Promise<Baileys> {
  if (!baileysMod) {
    baileysMod = await import('@whiskeysockets/baileys');
  }
  return baileysMod;
}

export type WhatsAppState =
  | 'disconnected'
  | 'qr'
  | 'connecting'
  | 'connected'
  | 'logged_out';

interface Session {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sock: any | null;
  state: WhatsAppState;
  qr: string | null; // raw QR string (browser renders to <canvas>)
  phone: string | null; // e.g. "+919958448730"
  startedAt: string | null;
  lastError: string | null;
}

const globalAny = globalThis as unknown as { __waSession?: Session };
const session: Session = (globalAny.__waSession ??= {
  sock: null,
  state: 'disconnected',
  qr: null,
  phone: null,
  startedAt: null,
  lastError: null,
});

const SESSION_DIR =
  process.env.WHATSAPP_SESSION_DIR ||
  (process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL
    ? '/data/whatsapp-session'
    : path.join(process.cwd(), '.whatsapp-session'));

function setState(next: WhatsAppState, extra: Partial<Session> = {}) {
  session.state = next;
  Object.assign(session, extra);
  eventBus.emitEvent({
    type: 'whatsapp-status',
    payload: { state: next, phone: session.phone ?? undefined },
  });
}

export function getStatus(): { state: WhatsAppState; qr: string | null; phone: string | null } {
  return { state: session.state, qr: session.qr, phone: session.phone };
}

export async function startSession(): Promise<void> {
  if (session.sock && (session.state === 'connected' || session.state === 'connecting' || session.state === 'qr')) {
    // Already running
    return;
  }

  await fs.mkdir(SESSION_DIR, { recursive: true }).catch(() => {});

  const baileys = await loadBaileys();
  // ESLint sees `useMultiFileAuthState` as a React hook because of the "use" prefix —
  // it's actually a Baileys helper, not a hook. Disable the rule for this file.
  /* eslint-disable react-hooks/rules-of-hooks */
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = baileys;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  /* eslint-enable react-hooks/rules-of-hooks */
  const { version } = await fetchLatestBaileysVersion();

  setState('connecting', { qr: null, lastError: null, startedAt: new Date().toISOString() });

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  session.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, qr, lastDisconnect } = u;

    if (qr) {
      setState('qr', { qr });
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0]?.replace(/[^0-9]/g, '') ?? null;
      setState('connected', { qr: null, phone: phone ? `+${phone}` : null });
      appendLog('WhatsApp connected', 'success');
    }

    if (connection === 'close') {
      // Boom-style error → status code on `.output.statusCode`. Defensive read.
      const code =
        (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const restartRequired = code === DisconnectReason.restartRequired;

      if (loggedOut) {
        // Wipe session files so next start triggers a fresh QR
        await fs.rm(SESSION_DIR, { recursive: true, force: true }).catch(() => {});
        session.sock = null;
        setState('logged_out', { qr: null, phone: null });
        appendLog('WhatsApp logged out — re-scan QR to reconnect', 'info');
        return;
      }

      // Anything else: try to reconnect after a beat
      session.sock = null;
      setState('disconnected', { qr: null, lastError: lastDisconnect?.error?.message ?? null });
      appendLog(`WhatsApp disconnected${restartRequired ? ' (restart required)' : ''} — reconnecting`, 'info');
      setTimeout(() => {
        // best-effort reconnect; errors are caught by startSession's outer handler
        void startSession();
      }, 2000);
    }
  });

  // Incoming messages → queue (do NOT auto-draft for cost control)
  sock.ev.on('messages.upsert', async (upsert: { messages: import('@whiskeysockets/baileys').WAMessage[] }) => {
    for (const m of upsert.messages) {
      if (m.key.fromMe) continue;
      if (!m.message) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue; // skip groups for v1
      if (jid === 'status@broadcast') continue;

      const text =
        m.message.conversation ??
        m.message.extendedTextMessage?.text ??
        m.message.imageMessage?.caption ??
        m.message.videoMessage?.caption ??
        '';

      if (!text.trim()) continue;

      enqueueWaMessage({
        jid,
        contactName: m.pushName ?? jid.split('@')[0],
        message: text,
        receivedAt: new Date(Number(m.messageTimestamp) * 1000 || Date.now()).toISOString(),
        whatsappMessageId: m.key.id ?? `${jid}_${Date.now()}`,
      });
      appendLog(`WhatsApp msg queued from ${m.pushName ?? jid}`, 'info');
    }
  });
}

export async function disconnect(): Promise<void> {
  if (session.sock) {
    try {
      await session.sock.logout();
    } catch {
      // ignore
    }
    session.sock = null;
  }
  await fs.rm(SESSION_DIR, { recursive: true, force: true }).catch(() => {});
  setState('disconnected', { qr: null, phone: null });
}

export async function sendMessage(jid: string, text: string): Promise<void> {
  if (!session.sock || session.state !== 'connected') {
    throw new Error('WhatsApp not connected');
  }
  await session.sock.sendMessage(jid, { text });
}
