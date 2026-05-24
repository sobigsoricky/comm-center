'use client';

import clsx from 'clsx';
import { useDraftStore } from '@/store/useDraftStore';
import { LogEntry } from '@/lib/types';

export function ActivityLog() {
  const { log } = useDraftStore();
  const recent = log.slice(0, 6);

  if (recent.length === 0) {
    return (
      <div className="h-8 bg-[#050810] border-t border-slate-800/60 flex items-center px-4">
        <span className="font-mono text-[10px] text-slate-700 tracking-widest">ACTIVITY LOG — Waiting…</span>
      </div>
    );
  }

  const levelColor: Record<LogEntry['level'], string> = {
    info:    'text-slate-600',
    success: 'text-emerald-600',
    error:   'text-red-600',
  };

  return (
    <div className="h-8 bg-[#050810] border-t border-slate-800/60 flex items-center px-4 gap-4 overflow-x-auto">
      <span className="font-mono text-[9px] text-slate-700 tracking-widest uppercase flex-shrink-0">LOG</span>
      {recent.map((entry, i) => (
        <span key={entry.id} className={clsx('font-mono text-[10px] whitespace-nowrap flex gap-2 flex-shrink-0', i > 0 && 'opacity-50')}>
          <span className="text-slate-700">{entry.ts}</span>
          <span className={levelColor[entry.level]}>{entry.msg}</span>
        </span>
      ))}
    </div>
  );
}
