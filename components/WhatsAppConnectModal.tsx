'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type State = 'idle' | 'starting' | 'qr' | 'connecting' | 'connected' | 'error';

export function WhatsAppConnectModal({ isOpen, onClose, onConnected }: WhatsAppConnectModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [qrString, setQrString] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onConnectedRef.current = onConnected;
    onCloseRef.current = onClose;
  });

  // Mount/unmount with entrance + exit animation
  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMounted(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Kick off connect + polling when opened
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const start = async () => {
      setState('starting');
      setError(null);
      setQrString(null);
      setPhone(null);
      try {
        await fetch('/api/whatsapp/connect', { method: 'POST' });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Connect failed');
        setState('error');
        return;
      }
      // Begin polling status every 1.5s
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch('/api/whatsapp/status', { cache: 'no-store' });
          const s = await r.json();
          if (cancelled) return;
          if (s.qr) {
            setQrString(s.qr);
          }
          if (s.phone) setPhone(s.phone);
          if (s.state === 'connected') {
            setState('connected');
            if (pollRef.current) clearInterval(pollRef.current);
            // brief success state then close
            setTimeout(() => {
              onConnectedRef.current();
              onCloseRef.current();
            }, 1400);
          } else if (s.state === 'connecting' || s.state === 'starting') {
            setState((prev) => (prev === 'connected' ? prev : 'connecting'));
          } else if (s.state === 'qr') {
            setState('qr');
          } else if (s.state === 'logged_out' || s.state === 'disconnected') {
            // Stay in current state; user can retry
          }
        } catch {
          /* transient */
        }
      }, 1500);
    };

    void start();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen]);

  // Render QR onto canvas whenever the string changes
  useEffect(() => {
    if (!qrString || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, qrString, {
      width: 256,
      margin: 1,
      color: { dark: '#0a0e12', light: '#f5f5f4' },
    }).catch(() => {
      /* ignore */
    });
  }, [qrString]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title"
      onClick={(e) => e.target === e.currentTarget && state !== 'connected' && onClose()}
      className={[
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/70 backdrop-blur-md',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        className={[
          'relative w-[460px] max-w-[92vw]',
          'bg-gradient-to-b from-[#0e1419] to-[#080b0f]',
          'border border-slate-700/70 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]',
          'overflow-hidden',
          'transition-all duration-300 ease-out',
          visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-6 opacity-0 scale-[0.97]',
        ].join(' ')}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-48 bg-emerald-400/10 blur-3xl rounded-full pointer-events-none" />

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          ×
        </button>

        <div className="relative px-8 pt-10 pb-7">
          {/* WhatsApp icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border border-emerald-400/30 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(52,211,153,0.18)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#22c55e" aria-hidden>
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.33 4.97L2.05 22l5.25-1.38a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.94 9.94 0 0 0 12.04 2zm5.79 14.13c-.24.67-1.42 1.31-1.96 1.36-.5.05-1.13.07-1.81-.11-.42-.13-.97-.31-1.66-.61-2.94-1.27-4.86-4.22-5.01-4.42-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.45.27-.3.6-.37.8-.37.2 0 .4 0 .58.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.32.4-.46.54-.15.15-.31.31-.13.61.18.3.79 1.31 1.69 2.12 1.16 1.04 2.14 1.36 2.44 1.51.3.15.47.13.65-.08.18-.21.74-.87.94-1.17.2-.3.4-.25.67-.15.27.1 1.72.81 2.01.96.3.15.49.22.56.34.08.13.08.76-.16 1.43z" />
            </svg>
          </div>

          <h2
            id="wa-modal-title"
            className="text-center text-[20px] text-white font-semibold tracking-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {state === 'connected' ? 'Connected!' : 'Connect WhatsApp'}
          </h2>

          {/* Body switches by state */}
          {state === 'connected' && (
            <div className="mt-5 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 text-3xl">
                ✓
              </div>
              <p className="text-[13px] text-slate-300">Linked to {phone ?? 'your phone'}</p>
              <p className="text-[11px] text-slate-500">Drafts will arrive automatically.</p>
            </div>
          )}

          {state === 'error' && (
            <div className="mt-5">
              <p className="text-center text-[13px] text-red-300">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setState('idle');
                }}
                className="mt-4 w-full h-11 rounded-xl font-mono text-[11px] font-bold tracking-widest uppercase bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                Retry
              </button>
            </div>
          )}

          {(state === 'starting' || state === 'connecting') && !qrString && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-[12px] text-slate-400">
                {state === 'starting' ? 'Starting WhatsApp session…' : 'Reconnecting…'}
              </p>
            </div>
          )}

          {state === 'qr' && qrString && (
            <>
              <p className="text-center text-[13px] text-slate-400 mt-2 leading-relaxed">
                Scan this QR with your phone’s WhatsApp.
              </p>
              <div className="mt-5 flex items-center justify-center">
                <div className="p-3 rounded-xl bg-stone-100">
                  <canvas ref={canvasRef} width={256} height={256} />
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <Step n={1} label="Open WhatsApp on your phone" />
                <Step n={2} label="Tap ⋮ → Linked Devices → Link a Device" />
                <Step n={3} label="Point your camera at this code" />
              </div>
              <p className="text-center text-[10px] text-slate-600 mt-5 font-mono tracking-wide">
                Auto-refreshes every ~60s. Keep this open.
              </p>
            </>
          )}

          {state !== 'connected' && state !== 'error' && (
            <button
              onClick={onClose}
              className="mt-6 w-full h-9 font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          )}

          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[10px] text-slate-600 font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            Session stored locally · disconnect anytime in Settings
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.025] border border-white/5">
      <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0 border border-emerald-400/25">
        {n}
      </span>
      <span className="text-[12px] text-slate-300">{label}</span>
    </div>
  );
}
