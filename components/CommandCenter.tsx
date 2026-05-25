'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useDraftStore, usePendingDrafts, useSentDrafts } from '@/store/useDraftStore';
import { DraftQueue } from './DraftQueue';
import { DraftDetail } from './DraftDetail';
import { ActivityLog } from './ActivityLog';
import { WAModal } from './WAModal';
import { SetupWizardModal } from './SetupWizardModal';
import { GmailConnectModal } from './GmailConnectModal';
import { WhatsAppConnectModal } from './WhatsAppConnectModal';
import { Draft, RedraftRequest } from '@/lib/types';

export function CommandCenter() {
  const [isScanning, setIsScanning] = useState(false);
  const [isDraftingWA, setIsDraftingWA] = useState(false);
  const [isRedrafting, setIsRedrafting] = useState(false);
  const [showWAModal, setShowWAModal] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [showWAConnectModal, setShowWAConnectModal] = useState(false);
  const [isScanningWA, setIsScanningWA] = useState(false);
  const [waBannerDismissed, setWaBannerDismissed] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  // WhatsApp connection state
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  const refreshWaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      const data = await res.json();
      setWaConnected(data.state === 'connected');
    } catch {
      setWaConnected(false);
    }
  }, []);

  // Gmail scan options — time range + pending-reply filter, persisted in localStorage
  type Range = '7d' | '30d' | '90d' | '1y' | '2y' | 'all';
  // Read saved range synchronously so we never call setState in mount-effect
  const initialRange = ((): Range => {
    if (typeof window === 'undefined') return '30d';
    try {
      const saved = window.localStorage.getItem('scanRange');
      if (saved && ['7d', '30d', '90d', '1y', '2y', 'all'].includes(saved)) {
        return saved as Range;
      }
    } catch {
      /* ignore */
    }
    return '30d';
  })();
  const [scanRange, setScanRange] = useState<Range>(initialRange);
  useEffect(() => {
    try {
      window.localStorage.setItem('scanRange', scanRange);
    } catch {
      /* ignore */
    }
  }, [scanRange]);

  // Gmail connection state — drives the banner + Connect Gmail button
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const refreshGmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/google/status', { cache: 'no-store' });
      const data = await res.json();
      setGmailConnected(Boolean(data.connected));
    } catch {
      setGmailConnected(false);
    }
  }, []);

  // Poll status on mount + when the OAuth popup posts back
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void refreshGmailStatus();
    void refreshWaStatus();
    /* eslint-enable react-hooks/set-state-in-effect */
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'gmail-connected') void refreshGmailStatus();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshGmailStatus, refreshWaStatus]);

  // (SSE listener mounted below, after addLog is in scope)

  // Slide-in banner state — animates in once we know we're disconnected
  const showBanner = gmailConnected === false && !bannerDismissed;
  const showWaBanner = waConnected === false && !waBannerDismissed;

  // ── Scan WhatsApp queue ──────────────────────────────────
  const handleScanWA = async () => {
    if (isScanningWA) return;
    setIsScanningWA(true);
    addLog('WhatsApp scan started', 'info');
    try {
      const res = await fetch('/api/whatsapp/scan', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.drafts?.length) {
        addDrafts(data.drafts as Draft[]);
        addLog(`WhatsApp scan complete — ${data.drafts.length} draft${data.drafts.length === 1 ? '' : 's'}`, 'success');
      } else {
        addLog('WhatsApp queue empty', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`WhatsApp scan error: ${msg}`, 'error');
    }
    setIsScanningWA(false);
  };

  const { addDrafts, addDraft, updateDraft, addLog } = useDraftStore();
  const pending = usePendingDrafts();
  const sent = useSentDrafts();

  // SSE — live push of activity log + WhatsApp status. Mounted once.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('whatsapp-status', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setWaConnected(data.state === 'connected');
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('log', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        addLog(d.msg, d.level);
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
    // addLog is a stable Zustand setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const res = await fetch('/api/scan-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: scanRange, pendingOnly: true, max: 50 }),
      });
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
        <div className="ml-auto flex gap-2 items-center">
          {gmailConnected === false && (
            <HeaderBtn onClick={() => setShowGmailModal(true)} variant="accent">
              ✉ Connect Gmail
            </HeaderBtn>
          )}
          {gmailConnected === true && (
            <span className="text-[10px] tracking-widest text-emerald-400/80 font-mono flex items-center gap-1.5 px-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
              GMAIL LIVE
            </span>
          )}
          {waConnected === false && (
            <HeaderBtn onClick={() => setShowWAConnectModal(true)} variant="accent">
              💬 Connect WhatsApp
            </HeaderBtn>
          )}
          {waConnected === true && (
            <span className="text-[10px] tracking-widest text-emerald-400/80 font-mono flex items-center gap-1.5 px-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
              WHATSAPP LIVE
            </span>
          )}
          <HeaderBtn onClick={() => setShowSetupWizard(true)} variant="secondary">
            ⚙ Setup
          </HeaderBtn>
          <HeaderBtn onClick={() => setShowWAModal(true)} disabled={isDraftingWA} variant="secondary">
            {isDraftingWA ? '⟳ Drafting…' : '+ WhatsApp'}
          </HeaderBtn>
          <RangeSelect value={scanRange} onChange={setScanRange} disabled={isScanning} />
          <HeaderBtn onClick={handleScanGmail} disabled={isScanning || gmailConnected === false} variant="primary">
            {isScanning ? '⟳ Scanning…' : '⟳ Scan Gmail'}
          </HeaderBtn>
          <HeaderBtn onClick={handleScanWA} disabled={isScanningWA || waConnected !== true} variant="primary">
            {isScanningWA ? '⟳ Scanning…' : '⟳ Scan WA'}
          </HeaderBtn>
        </div>
      </header>

      {/* ── Gmail-not-connected banner (slides in) ─────────── */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: showBanner ? '80px' : '0px',
          opacity: showBanner ? 1 : 0,
        }}
      >
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20 px-5 py-3 flex items-center gap-4">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
            <span className="text-amber-400 text-sm">✉</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[11px] text-amber-300 font-bold tracking-wide">
              Gmail not connected
            </p>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5">
              Authorize Gmail once to enable inbox scanning and AI drafts.
            </p>
          </div>
          <button
            onClick={() => setShowGmailModal(true)}
            className="font-mono text-[10px] font-bold tracking-widest uppercase px-4 py-2 rounded-md bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-[0_4px_20px_-4px_rgba(245,158,11,0.4)] active:scale-[0.98] flex-shrink-0"
          >
            Connect Gmail
          </button>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-colors text-base leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── WhatsApp banner ────────────────────────────────── */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: showWaBanner ? '80px' : '0px',
          opacity: showWaBanner ? 1 : 0,
        }}
      >
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-emerald-500/20 px-5 py-3 flex items-center gap-4">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
            <span className="text-emerald-400 text-sm">💬</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[11px] text-emerald-300 font-bold tracking-wide">
              WhatsApp not connected
            </p>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5">
              Scan once to enable live message watching + AI drafts.
            </p>
          </div>
          <button
            onClick={() => setShowWAConnectModal(true)}
            className="font-mono text-[10px] font-bold tracking-widest uppercase px-4 py-2 rounded-md bg-emerald-500 text-black hover:bg-emerald-400 transition-all shadow-[0_4px_20px_-4px_rgba(52,211,153,0.4)] active:scale-[0.98] flex-shrink-0"
          >
            Connect WhatsApp
          </button>
          <button
            onClick={() => setWaBannerDismissed(true)}
            aria-label="Dismiss"
            className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-colors text-base leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      </div>

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
      <GmailConnectModal
        isOpen={showGmailModal}
        onClose={() => setShowGmailModal(false)}
        onConnected={() => {
          void refreshGmailStatus();
          addLog('Gmail connected', 'success');
        }}
      />
      <WhatsAppConnectModal
        isOpen={showWAConnectModal}
        onClose={() => setShowWAConnectModal(false)}
        onConnected={() => {
          void refreshWaStatus();
          addLog('WhatsApp connected', 'success');
        }}
      />
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

function RangeSelect({
  value,
  onChange,
  disabled,
}: {
  value: '7d' | '30d' | '90d' | '1y' | '2y' | 'all';
  onChange: (v: '7d' | '30d' | '90d' | '1y' | '2y' | 'all') => void;
  disabled?: boolean;
}) {
  const options: Array<{ v: typeof value; label: string }> = [
    { v: '7d', label: 'Last 7 days' },
    { v: '30d', label: 'Last 30 days' },
    { v: '90d', label: 'Last 90 days' },
    { v: '1y', label: 'Last 1 year' },
    { v: '2y', label: 'Last 2 years' },
    { v: 'all', label: 'All time' },
  ];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as typeof value)}
      disabled={disabled}
      className="font-mono text-[10px] font-bold tracking-widest uppercase px-2 py-1.5 rounded bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-600 focus:border-amber-500/60 focus:outline-none disabled:opacity-40 cursor-pointer"
      title="Time range for Gmail scan"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v} className="bg-slate-900 text-slate-200">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function HeaderBtn({
  children, onClick, disabled, variant,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; variant: 'primary' | 'secondary' | 'accent';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-amber-500 text-black hover:bg-amber-400'
      : variant === 'accent'
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 hover:text-emerald-200 shadow-[0_0_15px_-5px_rgba(52,211,153,0.4)]'
        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        styles
      )}
    >
      {children}
    </button>
  );
}
