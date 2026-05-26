'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Draft, LogEntry } from '@/lib/types';

export interface ChannelStatus {
  connected: boolean | null;     // null = unknown (pre-first-probe)
  connectedAt: string | null;    // ISO of last connect transition
  disconnectedAt: string | null; // ISO of last disconnect transition
  lastScanAt: string | null;     // ISO of last successful scan
  lastScanCount: number | null;  // drafts created in last scan
}

const emptyStatus: ChannelStatus = {
  connected: null,
  connectedAt: null,
  disconnectedAt: null,
  lastScanAt: null,
  lastScanCount: null,
};

interface DraftStore {
  drafts: Draft[];
  log: LogEntry[];
  selectedId: string | null;

  // Connection status (persisted so the box shows last-known state on reload)
  gmailStatus: ChannelStatus;
  waStatus: ChannelStatus;

  // Draft actions
  setDrafts: (drafts: Draft[]) => void;
  addDrafts: (drafts: Draft[]) => void;
  addDraft: (draft: Draft) => void;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  markSent: (id: string) => void;
  deleteDraft: (id: string) => void;

  // Selection
  selectDraft: (id: string | null) => void;

  // Connection actions
  setGmailConnected: (connected: boolean) => void;
  setWAConnected: (connected: boolean) => void;
  recordGmailScan: (count: number) => void;
  recordWAScan: (count: number) => void;

  // Log
  addLog: (msg: string, level?: LogEntry['level']) => void;
  clearLog: () => void;
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      drafts: [],
      log: [],
      selectedId: null,
      gmailStatus: emptyStatus,
      waStatus: emptyStatus,

      setDrafts: (drafts) => set({ drafts }),

      addDrafts: (incoming) =>
        set((state) => {
          // Deduplicate by id — incoming wins on conflict
          const existingIds = new Set(incoming.map((d) => d.id));
          const kept = state.drafts.filter((d) => !existingIds.has(d.id));
          const merged = [...incoming, ...kept].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return { drafts: merged };
        }),

      addDraft: (draft) =>
        set((state) => ({
          drafts: [draft, ...state.drafts].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),
        })),

      updateDraft: (id, patch) =>
        set((state) => ({
          drafts: state.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
          // Bubble up selectedId data if viewing this draft
        })),

      markSent: (id) => {
        const sentAt = new Date().toISOString();
        set((state) => ({
          drafts: state.drafts.map((d) =>
            d.id === id ? { ...d, status: 'sent', sentAt } : d
          ),
          selectedId: state.selectedId === id ? null : state.selectedId,
        }));
        const draft = get().drafts.find((d) => d.id === id);
        if (draft) get().addLog(`Sent: ${draft.from}`, 'success');
      },

      deleteDraft: (id) =>
        set((state) => ({
          drafts: state.drafts.filter((d) => d.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        })),

      selectDraft: (id) => set({ selectedId: id }),

      setGmailConnected: (connected) =>
        set((state) => {
          const prev = state.gmailStatus.connected;
          if (prev === connected) return {}; // no transition
          const now = new Date().toISOString();
          return {
            gmailStatus: {
              ...state.gmailStatus,
              connected,
              connectedAt: connected ? now : state.gmailStatus.connectedAt,
              disconnectedAt: !connected ? now : state.gmailStatus.disconnectedAt,
            },
          };
        }),

      setWAConnected: (connected) =>
        set((state) => {
          const prev = state.waStatus.connected;
          if (prev === connected) return {};
          const now = new Date().toISOString();
          return {
            waStatus: {
              ...state.waStatus,
              connected,
              connectedAt: connected ? now : state.waStatus.connectedAt,
              disconnectedAt: !connected ? now : state.waStatus.disconnectedAt,
            },
          };
        }),

      recordGmailScan: (count) =>
        set((state) => ({
          gmailStatus: {
            ...state.gmailStatus,
            lastScanAt: new Date().toISOString(),
            lastScanCount: count,
          },
        })),

      recordWAScan: (count) =>
        set((state) => ({
          waStatus: {
            ...state.waStatus,
            lastScanAt: new Date().toISOString(),
            lastScanCount: count,
          },
        })),

      addLog: (msg, level = 'info') =>
        set((state) => ({
          log: [
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
              msg,
              ts: new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              level,
            },
            ...state.log,
          ].slice(0, 200),
        })),

      clearLog: () => set({ log: [] }),
    }),
    {
      name: 'rankfast-comm-center',
      // Only persist drafts and log — selectedId is ephemeral
      partialize: (state) => ({
        drafts: state.drafts,
        log: state.log,
        gmailStatus: state.gmailStatus,
        waStatus: state.waStatus,
      }),
    }
  )
);

// Convenience selectors — memoized so Zustand sees a stable reference
// (otherwise each render produces a new array and triggers re-render loops in StrictMode)
import { useMemo } from 'react';

const selectDrafts = (s: DraftStore) => s.drafts;
const selectSelectedId = (s: DraftStore) => s.selectedId;

export const usePendingDrafts = () => {
  const drafts = useDraftStore(selectDrafts);
  return useMemo(
    () =>
      drafts
        .filter((d) => d.status === 'pending')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [drafts]
  );
};

export const useSentDrafts = () => {
  const drafts = useDraftStore(selectDrafts);
  return useMemo(
    () =>
      drafts
        .filter((d) => d.status === 'sent')
        .sort((a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()),
    [drafts]
  );
};

export const useSelectedDraft = () => {
  const drafts = useDraftStore(selectDrafts);
  const selectedId = useDraftStore(selectSelectedId);
  return useMemo(() => drafts.find((d) => d.id === selectedId) ?? null, [drafts, selectedId]);
};
