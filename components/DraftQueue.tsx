'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Draft } from '@/lib/types';
import { PRIORITY_CONFIG, CHANNEL_CONFIG } from '@/lib/constants';
import { useDraftStore, usePendingDrafts, useSentDrafts } from '@/store/useDraftStore';
import { StatusBox } from './StatusBox';

type ChannelFilter = 'all' | 'email' | 'whatsapp';

function matches(draft: Draft, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const fields: Array<string | undefined> = [
    draft.from,
    draft.subject,
    draft.snippet,
    draft.originalMessage,
    draft.draftPreview,
    draft.fullDraft,
  ];
  return fields.some((f) => f && f.toLowerCase().includes(needle));
}

export function DraftQueue() {
  const [tab, setTab] = useState<'pending' | 'sent'>('pending');
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const pending = usePendingDrafts();
  const sent = useSentDrafts();
  const { selectedId, selectDraft } = useDraftStore();

  const baseList = tab === 'pending' ? pending : sent;

  const list = useMemo(() => {
    return baseList.filter((d) => {
      if (channelFilter !== 'all' && d.channel !== channelFilter) return false;
      return matches(d, query);
    });
  }, [baseList, query, channelFilter]);

  const totalShown = list.length;
  const totalBase = baseList.length;
  const filtering = query.trim().length > 0 || channelFilter !== 'all';

  return (
    <aside className="w-[300px] flex-shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-[#080c10]">
      {/* Status box — connection status + recent events */}
      <StatusBox />

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 px-3 pt-3 gap-1 flex-shrink-0">
        {(['pending', 'sent'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-t transition-colors font-mono',
              tab === t
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 border-b-transparent'
                : 'text-slate-500 hover:text-slate-400'
            )}
          >
            {t === 'pending' ? `Pending (${pending.length})` : `Sent (${sent.length})`}
          </button>
        ))}
      </div>

      {/* Filter input + channel chips */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-slate-800/60 space-y-1.5">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono pointer-events-none">
            ⌕
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sender, subject, body, draft…"
            className="w-full text-[11px] font-mono bg-slate-900/70 text-slate-200 placeholder:text-slate-700 border border-slate-800 hover:border-slate-700 focus:border-amber-500/60 focus:outline-none rounded pl-6 pr-7 py-1.5"
            aria-label="Filter drafts"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 text-[12px] leading-none"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(['all', 'email', 'whatsapp'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={clsx(
                  'text-[9px] font-mono font-bold tracking-widest uppercase px-1.5 py-0.5 rounded transition-colors',
                  channelFilter === c
                    ? 'bg-slate-700/80 text-slate-100'
                    : 'bg-slate-900/60 text-slate-600 hover:text-slate-400'
                )}
              >
                {c === 'all' ? 'All' : c === 'email' ? '✉ Email' : '💬 WA'}
              </button>
            ))}
          </div>
          {filtering && (
            <span className="text-[9px] font-mono text-slate-600 tracking-wide">
              {totalShown} / {totalBase}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-4xl opacity-20">
              {filtering ? '⌕' : tab === 'pending' ? '📬' : '✓'}
            </span>
            <p className="text-[11px] text-slate-600 font-mono tracking-wide text-center px-4">
              {filtering
                ? 'No drafts match the filter'
                : tab === 'pending'
                  ? 'No pending drafts'
                  : 'Nothing sent yet'}
            </p>
          </div>
        )}
        {list.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            isSelected={draft.id === selectedId}
            onClick={() => selectDraft(draft.id === selectedId ? null : draft.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function DraftRow({ draft, isSelected, onClick }: { draft: Draft; isSelected: boolean; onClick: () => void }) {
  const priority = PRIORITY_CONFIG[draft.priority];
  const channel = CHANNEL_CONFIG[draft.channel];

  const timeLabel = (() => {
    try {
      return formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 transition-colors group',
        isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-800/30',
        draft.status === 'sent' && 'opacity-50'
      )}
    >
      {/* Top row: from + priority */}
      <div className="flex items-center justify-between mb-0.5 gap-2">
        <span className="text-[12px] font-bold text-slate-200 truncate font-mono flex items-center gap-1.5">
          <span style={{ color: channel.color }} className="text-[10px]">{channel.icon}</span>
          {draft.from.split('<')[0].trim() || draft.from}
        </span>
        <span
          className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color: priority.color, background: priority.bg, border: `1px solid ${priority.border}` }}
        >
          {priority.label}
        </span>
      </div>

      {/* Subject */}
      <p className="text-[11px] text-slate-500 truncate font-mono mb-1">{draft.subject}</p>

      {/* Preview + time */}
      <div className="flex items-end justify-between gap-2">
        <p className="text-[10px] text-slate-700 truncate font-mono">{draft.draftPreview}</p>
        <span className="text-[9px] text-slate-700 flex-shrink-0 font-mono">{timeLabel}</span>
      </div>

      {/* Gmail draft indicator */}
      {draft.gmailDraftId && (
        <div className="mt-1.5">
          <span className="text-[9px] text-blue-500/60 font-mono tracking-wide">● saved to gmail drafts</span>
        </div>
      )}
    </button>
  );
}
