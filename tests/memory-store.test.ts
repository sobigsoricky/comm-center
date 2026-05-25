import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Draft } from '@/lib/types';

// Reset the singleton between tests:
// - resetModules() invalidates Vitest's module cache so the next import re-runs init
// - deleting the globals lets the ??= in the module re-initialize cleanly
async function freshStore() {
  vi.resetModules();
  delete (globalThis as unknown as { __commStore?: unknown }).__commStore;
  delete (globalThis as unknown as { __commBus?: unknown }).__commBus;
  return await import('@/lib/memory-store');
}

function makeDraft(over: Partial<Draft> = {}): Draft {
  return {
    id: over.id ?? `d_${Math.random().toString(36).slice(2)}`,
    channel: over.channel ?? 'email',
    from: over.from ?? 'test@example.com',
    subject: over.subject ?? 'Test',
    receivedAt: over.receivedAt ?? new Date().toISOString(),
    createdAt: over.createdAt ?? new Date().toISOString(),
    snippet: over.snippet ?? '',
    priority: over.priority ?? 'medium',
    status: over.status ?? 'pending',
    fullDraft: over.fullDraft ?? 'draft body',
    draftPreview: over.draftPreview ?? 'preview',
    ...over,
  };
}

describe('memory-store — drafts CRUD', () => {
  beforeEach(async () => {
    await freshStore();
  });

  it('upserts and retrieves a draft', async () => {
    const { upsertDraft, getDraft } = await freshStore();
    const d = makeDraft({ id: 'a' });
    upsertDraft(d);
    expect(getDraft('a')?.fullDraft).toBe('draft body');
  });

  it('overwrites on second upsert (same id)', async () => {
    const { upsertDraft, getDraft } = await freshStore();
    upsertDraft(makeDraft({ id: 'a', fullDraft: 'v1' }));
    upsertDraft(makeDraft({ id: 'a', fullDraft: 'v2' }));
    expect(getDraft('a')?.fullDraft).toBe('v2');
  });

  it('removes draft', async () => {
    const { upsertDraft, getDraft, removeDraft } = await freshStore();
    upsertDraft(makeDraft({ id: 'a' }));
    expect(removeDraft('a')).toBe(true);
    expect(getDraft('a')).toBeUndefined();
  });

  it('remove returns false when draft missing', async () => {
    const { removeDraft } = await freshStore();
    expect(removeDraft('nonexistent')).toBe(false);
  });

  it('lists drafts sorted newest first', async () => {
    const { upsertDraft, listDrafts } = await freshStore();
    upsertDraft(makeDraft({ id: '1', createdAt: '2026-05-20T00:00:00Z' }));
    upsertDraft(makeDraft({ id: '2', createdAt: '2026-05-22T00:00:00Z' }));
    upsertDraft(makeDraft({ id: '3', createdAt: '2026-05-21T00:00:00Z' }));
    const out = listDrafts();
    expect(out.map((d) => d.id)).toEqual(['2', '3', '1']);
  });

  it('filters by channel', async () => {
    const { upsertDraft, listDrafts } = await freshStore();
    upsertDraft(makeDraft({ id: '1', channel: 'email' }));
    upsertDraft(makeDraft({ id: '2', channel: 'whatsapp' }));
    expect(listDrafts({ channel: 'email' })).toHaveLength(1);
    expect(listDrafts({ channel: 'whatsapp' })).toHaveLength(1);
  });

  it('filters by status', async () => {
    const { upsertDraft, listDrafts } = await freshStore();
    upsertDraft(makeDraft({ id: '1', status: 'pending' }));
    upsertDraft(makeDraft({ id: '2', status: 'sent' }));
    expect(listDrafts({ status: 'pending' })).toHaveLength(1);
    expect(listDrafts({ status: 'sent' })).toHaveLength(1);
  });

  it('marks draft as sent and sets sentAt', async () => {
    const { upsertDraft, markDraftSent, getDraft } = await freshStore();
    upsertDraft(makeDraft({ id: 'a' }));
    const result = markDraftSent('a');
    expect(result?.status).toBe('sent');
    expect(result?.sentAt).toBeDefined();
    expect(getDraft('a')?.status).toBe('sent');
  });

  it('markDraftSent returns undefined for missing draft', async () => {
    const { markDraftSent } = await freshStore();
    expect(markDraftSent('nonexistent')).toBeUndefined();
  });
});

describe('memory-store — activity log', () => {
  beforeEach(async () => {
    await freshStore();
  });

  it('appends a log entry', async () => {
    const { appendLog, getLog } = await freshStore();
    appendLog('test message');
    const log = getLog();
    expect(log[0].msg).toBe('test message');
    expect(log[0].level).toBe('info');
  });

  it('newest entries first', async () => {
    const { appendLog, getLog } = await freshStore();
    appendLog('first');
    appendLog('second');
    appendLog('third');
    const log = getLog();
    expect(log.map((l) => l.msg)).toEqual(['third', 'second', 'first']);
  });

  it('respects log cap (100 entries)', async () => {
    const { appendLog, getLog } = await freshStore();
    for (let i = 0; i < 150; i++) {
      appendLog(`msg ${i}`);
    }
    const log = getLog();
    expect(log.length).toBe(100);
    expect(log[0].msg).toBe('msg 149'); // newest
    expect(log[99].msg).toBe('msg 50'); // 100 most recent kept
  });

  it('honors level parameter', async () => {
    const { appendLog, getLog } = await freshStore();
    appendLog('error here', 'error');
    expect(getLog()[0].level).toBe('error');
  });

  it('limit parameter truncates result', async () => {
    const { appendLog, getLog } = await freshStore();
    for (let i = 0; i < 10; i++) appendLog(`m${i}`);
    expect(getLog(3).length).toBe(3);
  });
});

describe('memory-store — WhatsApp inbound queue', () => {
  beforeEach(async () => {
    await freshStore();
  });

  it('queues a message', async () => {
    const { enqueueWaMessage, waInboundCount } = await freshStore();
    enqueueWaMessage({
      jid: '1234@s.whatsapp.net',
      contactName: 'Liber',
      message: 'hi',
      receivedAt: new Date().toISOString(),
      whatsappMessageId: 'wm1',
    });
    expect(waInboundCount()).toBe(1);
  });

  it('dedupes by whatsappMessageId', async () => {
    const { enqueueWaMessage, waInboundCount } = await freshStore();
    const base = {
      jid: '1234@s.whatsapp.net',
      contactName: 'Liber',
      message: 'hi',
      receivedAt: new Date().toISOString(),
      whatsappMessageId: 'wm1',
    };
    enqueueWaMessage(base);
    enqueueWaMessage(base);
    enqueueWaMessage(base);
    expect(waInboundCount()).toBe(1);
  });

  it('drains and clears the queue', async () => {
    const { enqueueWaMessage, drainWaInbound, waInboundCount } = await freshStore();
    enqueueWaMessage({
      jid: 'a@s.whatsapp.net',
      contactName: 'A',
      message: 'hi',
      receivedAt: '2026-05-20T00:00:00Z',
      whatsappMessageId: 'm1',
    });
    enqueueWaMessage({
      jid: 'b@s.whatsapp.net',
      contactName: 'B',
      message: 'hello',
      receivedAt: '2026-05-21T00:00:00Z',
      whatsappMessageId: 'm2',
    });
    const drained = drainWaInbound();
    expect(drained).toHaveLength(2);
    expect(waInboundCount()).toBe(0);
  });

  it('drains in chronological order (oldest first)', async () => {
    const { enqueueWaMessage, drainWaInbound } = await freshStore();
    enqueueWaMessage({
      jid: 'a',
      contactName: 'A',
      message: 'newest',
      receivedAt: '2026-05-22T00:00:00Z',
      whatsappMessageId: 'm1',
    });
    enqueueWaMessage({
      jid: 'a',
      contactName: 'A',
      message: 'oldest',
      receivedAt: '2026-05-20T00:00:00Z',
      whatsappMessageId: 'm2',
    });
    enqueueWaMessage({
      jid: 'a',
      contactName: 'A',
      message: 'middle',
      receivedAt: '2026-05-21T00:00:00Z',
      whatsappMessageId: 'm3',
    });
    const drained = drainWaInbound();
    expect(drained.map((m) => m.message)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('returns empty array when nothing queued', async () => {
    const { drainWaInbound } = await freshStore();
    expect(drainWaInbound()).toEqual([]);
  });
});
