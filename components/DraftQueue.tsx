'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Draft } from '@/lib/types';
import { PRIORITY_CONFIG, CHANNEL_CONFIG } from '@/lib/constants';
import { useDraftStore, usePendingDrafts, useSentDrafts } from '@/store/useDraftStore';

export function DraftQueue() {
  const [tab, setTab] = useState<'pending' | 'sent'>('pending');
  const pending = usePendingDrafts();
  const sent = useSentDrafts();
  const { selectedId, selectDraft } = useDraftStore();

  const list = tab === 'pending' ? pending : sent;

  return (
    <aside className="w-[300px] flex-shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-[#080c10]">
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

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl opacity-20">{tab === 'pending' ? '📬' : '✓'}</span>
            <p className="text-[11px] text-slate-600 font-mono tracking-wide">
              {tab === 'pending' ? 'No pending drafts' : 'Nothing sent yet'}
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
