/**
 * In-memory state. Survives until container restart.
 *
 * Why no DB:
 * - Gmail drafts live in Gmail. WhatsApp messages live on WhatsApp servers.
 * - Our drafts are ephemeral suggestions. On restart, next scan re-generates from inbox state.
 * - Activity log is a ring buffer.
 * - WhatsApp inbound queue lets the dashboard's "Scan WhatsApp" button work on-demand.
 *
 * Singleton via globalThis so hot-reload in dev doesn't drop state.
 */

import { Draft, LogEntry } from './types';
import { eventBus } from './event-bus';

interface WaInbound {
  jid: string;
  contactName: string;
  message: string;
  receivedAt: string;
  whatsappMessageId: string;
}

interface Store {
  drafts: Map<string, Draft>;
  log: LogEntry[]; // most recent first
  waInbound: Map<string, WaInbound>; // dedupe by whatsappMessageId
}

const globalAny = globalThis as unknown as { __commStore?: Store };
const store: Store = (globalAny.__commStore ??= {
  drafts: new Map(),
  log: [],
  waInbound: new Map(),
});

// ── Drafts ──────────────────────────────────────────────────────

export function listDrafts(filter?: { channel?: 'email' | 'whatsapp'; status?: Draft['status'] }): Draft[] {
  const all = Array.from(store.drafts.values());
  const filtered = all.filter((d) => {
    if (filter?.channel && d.channel !== filter.channel) return false;
    if (filter?.status && d.status !== filter.status) return false;
    return true;
  });
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getDraft(id: string): Draft | undefined {
  return store.drafts.get(id);
}

export function upsertDraft(d: Draft): void {
  const wasNew = !store.drafts.has(d.id);
  store.drafts.set(d.id, d);
  eventBus.emitEvent({
    type: wasNew ? 'draft' : 'draft-updated',
    payload: { id: d.id },
  });
}

export function removeDraft(id: string): boolean {
  const had = store.drafts.delete(id);
  if (had) eventBus.emitEvent({ type: 'draft-removed', payload: { id } });
  return had;
}

export function markDraftSent(id: string): Draft | undefined {
  const d = store.drafts.get(id);
  if (!d) return undefined;
  const updated: Draft = { ...d, status: 'sent', sentAt: new Date().toISOString() };
  store.drafts.set(id, updated);
  eventBus.emitEvent({ type: 'draft-updated', payload: { id } });
  return updated;
}

// ── Activity log ──────────────────────────────────────────────

const LOG_CAP = 100;

export function appendLog(msg: string, level: LogEntry['level'] = 'info'): LogEntry {
  const entry: LogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    msg,
    ts: new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    level,
  };
  store.log.unshift(entry);
  if (store.log.length > LOG_CAP) store.log.length = LOG_CAP;
  eventBus.emitEvent({ type: 'log', payload: { ts: entry.ts, level: entry.level, msg: entry.msg } });
  return entry;
}

export function getLog(limit = LOG_CAP): LogEntry[] {
  return store.log.slice(0, limit);
}

// ── WhatsApp inbound queue ─────────────────────────────────────

export function enqueueWaMessage(msg: WaInbound): void {
  store.waInbound.set(msg.whatsappMessageId, msg);
}

export function drainWaInbound(): WaInbound[] {
  const list = Array.from(store.waInbound.values()).sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  );
  store.waInbound.clear();
  return list;
}

export function waInboundCount(): number {
  return store.waInbound.size;
}
