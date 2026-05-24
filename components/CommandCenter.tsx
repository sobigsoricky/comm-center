'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useDraftStore, usePendingDrafts, useSentDrafts } from '@/store/useDraftStore';
import { DraftQueue } from './DraftQueue';
import { DraftDetail } from './DraftDetail';
import { ActivityLog } from './ActivityLog';
import { WAModal } from './WAModal';
import { SetupWizardModal } from './SetupWizardModal';
import { Draft, RedraftRequest } from '@/lib/types';

export function CommandCenter() {
  const [isScanning, setIsScanning] = useState(false);
  const [isDraftingWA, setIsDraftingWA] = useState(false);
  const [isRedrafting, setIsRedrafting] = useState(false);
  const [showWAModal, setShowWAModal] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const { addDrafts, addDraft, updateDraft, addLog } = useDraftStore();
  const pending = usePendingDrafts();
  const sent = useSentDrafts();

  // Track latest scan so a stale completion can't overwrite a fresh one
  const scanReqRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emailCount = pending.filter((d) => d.channel === 'email').length;
  const waCount = pending.filter((d) => d.channel === 'whatsapp').length;

  // ── Scan Gmail ─────────────────────────────────────────────
  const handleScanGmail = async () => {
    if (isScanning) return; // guard against double-fire
    const reqId = ++scanReqRef.current;
    setIsScanning(true);
    setScanStatus('Scanning inbox…');
    addLog('Gmail inbox scan started', 'info');

    try {
      const res = await fetch('/api/scan-gmail', { method: 'POST' });
      const data = await res.json();

      if (reqId !== scanReqRef.current) return; // stale; ignore
      if (data.error) throw new Error(data.error);

      if (data.drafts?.length > 0) {
        addDrafts(data.drafts as Draft[]);
        setScanStatus(`✓ ${data.drafts.length} draft${data.drafts.length !== 1 ? 's' : ''} saved to Gmail`);
        addLog(`Inbox scan complete — ${data.drafts.length} drafts created`, 'success');
      } else {
        setScanStatus('✓ Inbox clear');
        addLog('Inbox scan complete — no unread emails', 'info');
      }
    } catch (err) {
      if (reqId !== scanReqRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setScanStatus(`✗ ${msg}`);
      addLog(`Scan error: ${msg}`, 'error');
    }

    if (reqId !== scanReqRef.current) return;
    setIsScanning(false);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setScanStatus(''), 5000);
  };

  // ── Draft WhatsApp ─────────────────────────────────────────
  const handleDraftWA = async (form: { contact: string; message: string; context: string }) => {
    setIsDraftingWA(true);
    setShowWAModal(false);
    addLog(`Drafting WA reply for ${form.contact}`, 'info');

    try {
      const res = await fetch('/api/draft-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      addDraft(data.draft as Draft);
      addLog(`WA draft ready for ${form.contact}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`WA draft error: ${msg}`, 'error');
    }

    setIsDraftingWA(false);
  };

  // ── Redraft ────────────────────────────────────────────────
  const handleRedraft = async (req: RedraftRequest) => {
    setIsRedrafting(true);
    addLog(`Redrafting for ${req.from}`, 'info');

    try {
      const res = await fetch('/api/redraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      updateDraft(req.draftId, {
        fullDraft: data.fullDraft,
        draftPreview: data.draftPreview,
      });
      addLog(`Draft revised for ${req.from}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Redraft error: ${msg}`, 'error');
    }

    setIsRedrafting(false);
  };

  const scanBusy = isScanning || isDraftingWA;

  return (
    <div className="h-screen flex flex-col bg-[#070a0d] text-slate-300 overflow-hidden font-mono">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-gradient-to-b from-[#0e1419] to-[#070a0d] border-b border-slate-800 px-5 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex flex-col">
          <span className="text-amber-400 text-sm font-bold tracking-widest uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ⬡ Comm Center
          </span>
          <span className="text-[9px] text-slate-700 tracking-widest">RANKFAST · PRANAY MISHRA</span>
        </div>

        {/* Stats */}
        <div className="flex gap-2 ml-2">
          <StatPill color="#3b82f6" label={`✉ ${emailCount} Email`} />
          <StatPill color="#22c55e" label={`💬 ${waCount} WA`} />
          <StatPill color="#64748b" label={`✓ ${sent.length} Sent`} />
        </div>

        {/* Scan status message */}
        {scanStatus && (
          <span
            className={clsx(
              'text-[11px] font-mono transition-opacity',
              scanStatus.startsWith('✓') ? 'text-emerald-400' : scanStatus.startsWith('✗') ? 'text-red-400' : 'text-amber-400'
            )}
          >
            {scanStatus}
          </span>
        )}

        {/* Spinner */}
        {scanBusy && (
          <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
        )}
        {isRedrafting && (
          <span className="text-[10px] text-amber-400 tracking-widest">Redrafting…</span>
        )}

        {/* Actions */}
        <div className="ml-auto flex gap-2">
          <HeaderBtn onClick={() => setShowSetupWizard(true)} variant="secondary">
            ⚙ Setup
          </HeaderBtn>
          <HeaderBtn onClick={() => setShowWAModal(true)} disabled={isDraftingWA} variant="secondary">
            {isDraftingWA ? '⟳ Drafting…' : '+ WhatsApp'}
          </HeaderBtn>
          <HeaderBtn onClick={handleScanGmail} disabled={isScanning} variant="primary">
            {isScanning ? '⟳ Scanning…' : '⟳ Scan Gmail'}
          </HeaderBtn>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden">
        <DraftQueue />
        <DraftDetail onRedraftRequest={handleRedraft} isRedrafting={isRedrafting} />
      </main>

      {/* ── Activity Log ────────────────────────────────────── */}
      <ActivityLog />

      {/* ── Modals ──────────────────────────────────────────── */}
      {showWAModal && (
        <WAModal
          onClose={() => setShowWAModal(false)}
          onSubmit={handleDraftWA}
          isLoading={isDraftingWA}
        />
      )}
      {showSetupWizard && (
        <SetupWizardModal onClose={() => setShowSetupWizard(false)} />
      )}
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────

function StatPill({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="text-[10px] font-bold tracking-widest px-2.5 py-1 rounded"
      style={{ color, background: `${color}11`, border: `1px solid ${color}33` }}
    >
      {label}
    </span>
  );
}

function HeaderBtn({
  children, onClick, disabled, variant,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; variant: 'primary' | 'secondary';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-amber-500 text-black hover:bg-amber-400'
          : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
      )}
    >
      {children}
    </button>
  );
}
