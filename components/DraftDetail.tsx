'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useDraftStore, useSelectedDraft } from '@/store/useDraftStore';
import { PRIORITY_CONFIG, CHANNEL_CONFIG } from '@/lib/constants';
import { RedraftRequest } from '@/lib/types';

interface DraftDetailProps {
  onRedraftRequest: (req: RedraftRequest) => void;
  isRedrafting: boolean;
}

export function DraftDetail({ onRedraftRequest, isRedrafting }: DraftDetailProps) {
  const draft = useSelectedDraft();
  const { markSent, deleteDraft, addLog } = useDraftStore();
  const [copied, setCopied] = useState(false);
  const [showRedraft, setShowRedraft] = useState(false);
  const [instruction, setInstruction] = useState('');

  if (!draft) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-700">
        <span className="text-6xl opacity-20">⌘</span>
        <p className="font-mono text-xs tracking-widest uppercase">Select a draft to review</p>
      </div>
    );
  }

  const priority = PRIORITY_CONFIG[draft.priority];
  const channel = CHANNEL_CONFIG[draft.channel];

  const copyDraft = () => {
    navigator.clipboard.writeText(draft.fullDraft).then(() => {
      setCopied(true);
      addLog(`Copied draft for ${draft.from}`, 'info');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleMarkSent = () => {
    markSent(draft.id);
    addLog(`Marked as sent: ${draft.from}`, 'success');
  };

  const handleRedraft = () => {
    if (!instruction.trim()) return;
    onRedraftRequest({
      draftId: draft.id,
      currentDraft: draft.fullDraft,
      from: draft.from,
      subject: draft.subject,
      instruction,
    });
    setInstruction('');
    setShowRedraft(false);
  };

  const receivedAt = (() => {
    try { return format(new Date(draft.receivedAt), 'dd MMM yyyy, HH:mm'); } catch { return draft.receivedAt; }
  })();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#090d11] border-b border-slate-800 px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-mono text-slate-100 font-bold text-sm truncate mb-1">{draft.subject}</h2>
            <p className="font-mono text-slate-500 text-xs">{draft.from}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0 items-center">
            {/* Channel badge */}
            <span
              className="font-mono text-[9px] font-bold tracking-widest px-2 py-1 rounded"
              style={{ color: channel.color, background: `${channel.color}11`, border: `1px solid ${channel.color}33` }}
            >
              {channel.icon} {channel.label.toUpperCase()}
            </span>
            {/* Priority badge */}
            <span
              className="font-mono text-[9px] font-bold tracking-widest px-2 py-1 rounded"
              style={{ color: priority.color, background: priority.bg, border: `1px solid ${priority.border}` }}
            >
              {priority.label}
            </span>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex gap-6 mt-3">
          <Meta label="Received" value={receivedAt} />
          {draft.gmailDraftId && <Meta label="Gmail Draft" value={draft.gmailDraftId.slice(0, 16) + '…'} highlight />}
          {draft.status === 'sent' && <Meta label="Status" value="✓ SENT" highlight />}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

        {/* Original message (WhatsApp only) */}
        {draft.originalMessage && (
          <Section label="Original Message" dotColor="#6b7280">
            <p className="font-mono text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">
              {draft.originalMessage}
            </p>
          </Section>
        )}

        {/* Snippet (email) */}
        {!draft.originalMessage && draft.snippet && (
          <Section label="Email Snippet" dotColor="#6b7280">
            <p className="font-mono text-xs text-slate-500 leading-relaxed">{draft.snippet}</p>
          </Section>
        )}

        {/* AI Draft */}
        <Section label="AI Draft" dotColor="#f59e0b" accent>
          <p className="font-mono text-[13px] text-slate-300 leading-7 whitespace-pre-wrap">
            {draft.fullDraft}
          </p>
        </Section>

        {/* Redraft input */}
        {showRedraft && (
          <div className="bg-slate-900/60 border border-slate-700 rounded p-4 flex flex-col gap-3">
            <p className="font-mono text-[10px] text-amber-400 tracking-widest uppercase">Revision Instruction</p>
            <textarea
              className="bg-[#070a0d] border border-slate-700 rounded px-3 py-2 font-mono text-xs text-slate-200 outline-none resize-none w-full placeholder:text-slate-700 focus:border-amber-500/50"
              rows={3}
              placeholder="e.g. Make it shorter, add the ROAS numbers, be more formal…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <ActionBtn onClick={handleRedraft} disabled={isRedrafting || !instruction.trim()} variant="amber">
                {isRedrafting ? 'Redrafting…' : '↻ Redraft'}
              </ActionBtn>
              <ActionBtn onClick={() => setShowRedraft(false)} variant="ghost">Cancel</ActionBtn>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-t border-slate-800 px-6 py-3 flex gap-2 flex-wrap flex-shrink-0 bg-[#060a0d]">
        <ActionBtn onClick={copyDraft} variant="primary">
          {copied ? '✓ Copied' : draft.channel === 'whatsapp' ? '📋 Copy for WhatsApp' : '📋 Copy Draft'}
        </ActionBtn>

        {draft.channel === 'email' && draft.gmailDraftId && (
          <ActionBtn
            onClick={() => window.open('https://mail.google.com/mail/u/0/#drafts', '_blank')}
            variant="blue"
          >
            ✉ Open in Gmail
          </ActionBtn>
        )}

        {draft.status === 'pending' && (
          <ActionBtn onClick={handleMarkSent} variant="green">✓ Mark Sent</ActionBtn>
        )}

        {!showRedraft && (
          <ActionBtn onClick={() => setShowRedraft(true)} variant="ghost" disabled={isRedrafting}>
            ↻ Redraft
          </ActionBtn>
        )}

        <div className="ml-auto">
          <ActionBtn onClick={() => deleteDraft(draft.id)} variant="danger">✕ Delete</ActionBtn>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Meta({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-0.5">{label}</p>
      <p className={clsx('font-mono text-[11px]', highlight ? 'text-amber-400' : 'text-slate-400')}>{value}</p>
    </div>
  );
}

function Section({ label, dotColor, children, accent }: {
  label: string; dotColor: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={clsx('rounded border p-4', accent ? 'bg-[#0d1318] border-slate-700' : 'bg-[#090d11] border-slate-800')}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="font-mono text-[10px] tracking-widest uppercase text-slate-600">{label}</span>
      </div>
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'amber' | 'blue' | 'green' | 'ghost' | 'danger';

const variantStyles: Record<BtnVariant, string> = {
  primary: 'bg-slate-700 text-slate-200 hover:bg-slate-600 border-transparent',
  amber:   'bg-amber-500 text-black hover:bg-amber-400 border-transparent font-bold',
  blue:    'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-600/30',
  green:   'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border-emerald-600/30',
  ghost:   'bg-transparent text-slate-500 hover:text-slate-300 border-slate-700',
  danger:  'bg-transparent text-red-500/70 hover:text-red-400 border-red-500/20',
};

function ActionBtn({ children, onClick, variant = 'primary', disabled }: {
  children: React.ReactNode; onClick?: () => void; variant?: BtnVariant; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-all',
        variantStyles[variant],
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}
