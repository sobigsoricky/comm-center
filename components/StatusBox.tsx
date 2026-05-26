'use client';

import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useDraftStore, type ChannelStatus } from '@/store/useDraftStore';
import { LogEntry } from '@/lib/types';

// Connection-event keywords we surface in the recent-events list.
const CONNECTION_REGEX = /connect|disconnect|scan|auth|token|oauth|qr/i;

function relative(iso: string | null): string {
  if (!iso) return 'never';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

function ChannelRow({
  label,
  icon,
  status,
}: {
  label: string;
  icon: string;
  status: ChannelStatus;
}) {
  const dotColor =
    status.connected === true
      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
      : status.connected === false
        ? 'bg-red-500/70'
        : 'bg-slate-600';

  const stateLabel =
    status.connected === true
      ? `Connected ${status.connectedAt ? relative(status.connectedAt) : ''}`
      : status.connected === false
        ? `Disconnected${status.disconnectedAt ? ' · ' + relative(status.disconnectedAt) : ''}`
        : 'Unknown';

  const scanLine =
    status.lastScanAt && status.lastScanCount !== null
      ? `Last scan: ${status.lastScanCount} draft${status.lastScanCount === 1 ? '' : 's'} · ${relative(status.lastScanAt)}`
      : 'No scans yet';

  return (
    <div className="px-3 py-2 border-b border-slate-800/60">
      <div className="flex items-center gap-2 mb-0.5">
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor)} />
        <span className="text-[10px] tracking-widest font-bold text-slate-300 uppercase font-mono flex items-center gap-1">
          <span style={{ fontSize: '11px' }}>{icon}</span>
          {label}
        </span>
      </div>
      <p className="text-[10px] text-slate-500 font-mono ml-3.5 truncate">{stateLabel}</p>
      <p className="text-[9px] text-slate-600 font-mono ml-3.5 truncate">{scanLine}</p>
    </div>
  );
}

const levelColor: Record<LogEntry['level'], string> = {
  info: 'text-slate-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
};

export function StatusBox() {
  const gmailStatus = useDraftStore((s) => s.gmailStatus);
  const waStatus = useDraftStore((s) => s.waStatus);
  const log = useDraftStore((s) => s.log);

  const events = useMemo(
    () => log.filter((e) => CONNECTION_REGEX.test(e.msg)).slice(0, 8),
    [log]
  );

  return (
    <div className="flex-shrink-0 border-b border-slate-800 bg-[#070b0f]">
      <div className="px-3 py-1.5 border-b border-slate-800/60 flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-widest text-slate-600 uppercase font-mono">
          STATUS
        </span>
      </div>

      <ChannelRow label="Gmail" icon="✉" status={gmailStatus} />
      <ChannelRow label="WhatsApp" icon="💬" status={waStatus} />

      {/* Recent connection events */}
      <div className="px-3 py-2">
        <p className="text-[9px] font-bold tracking-widest text-slate-600 uppercase font-mono mb-1">
          Recent events
        </p>
        {events.length === 0 ? (
          <p className="text-[10px] text-slate-700 font-mono italic">No events yet</p>
        ) : (
          <ul className="space-y-0.5 max-h-[120px] overflow-y-auto pr-1">
            {events.map((e) => (
              <li
                key={e.id}
                className="text-[10px] font-mono leading-snug flex gap-2"
                title={e.msg}
              >
                <span className="text-slate-700 flex-shrink-0">{e.ts}</span>
                <span className={clsx(levelColor[e.level], 'truncate')}>{e.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
