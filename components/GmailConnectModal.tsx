'use client';

import { useEffect, useState } from 'react';

interface GmailConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export function GmailConnectModal({ isOpen, onClose, onConnected }: GmailConnectModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mount / unmount with delay for exit animation
  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMounted(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      // Trigger entrance animation on next paint
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Listen for the OAuth popup's success message
  useEffect(() => {
    if (!isOpen) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'gmail-connected') {
        setBusy(false);
        onConnected();
        onClose();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isOpen, onClose, onConnected]);

  const connect = () => {
    setBusy(true);
    const popup = window.open(
      '/api/auth/google',
      'gmail-auth',
      'width=520,height=720,left=' +
        Math.max(0, window.screenX + (window.outerWidth - 520) / 2) +
        ',top=' +
        Math.max(0, window.screenY + (window.outerHeight - 720) / 2)
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Popup blocked → same-tab fallback
      window.location.href = '/api/auth/google';
      return;
    }

    try {
      popup.focus();
    } catch {
      /* ignore */
    }

    // Detect manual close (user cancelled)
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setBusy(false);
      }
    }, 400);
  };

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-modal-title"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      className={[
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/70 backdrop-blur-md',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        className={[
          'relative w-[440px] max-w-[92vw]',
          'bg-gradient-to-b from-[#0e1419] to-[#080b0f]',
          'border border-slate-700/70 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]',
          'overflow-hidden',
          'transition-all duration-300 ease-out',
          visible
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-6 opacity-0 scale-[0.97]',
        ].join(' ')}
      >
        {/* Subtle glow accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-48 bg-amber-400/10 blur-3xl rounded-full pointer-events-none" />

        {/* Close X */}
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-30"
        >
          ×
        </button>

        <div className="relative px-8 pt-10 pb-7">
          {/* Gmail icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-400/30 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
            <svg width="28" height="22" viewBox="0 0 24 19" fill="none">
              <path
                d="M2 0h20a2 2 0 012 2v15a2 2 0 01-2 2H2a2 2 0 01-2-2V2a2 2 0 012-2zm0 2v.5l10 7 10-7V2H2zm20 2.9L13.1 11a2 2 0 01-2.2 0L2 4.9V17h20V4.9z"
                fill="#f59e0b"
              />
            </svg>
          </div>

          {/* Title */}
          <h2
            id="gmail-modal-title"
            className="text-center text-[20px] text-white font-semibold tracking-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Connect your Gmail
          </h2>
          <p className="text-center text-[13px] text-slate-400 mt-2 leading-relaxed">
            Comm Center will read unread emails and save AI-drafted replies as
            Gmail drafts. Nothing is sent without your approval.
          </p>

          {/* Steps preview */}
          <div className="mt-7 space-y-2.5">
            <Step n={1} label="Sign in with your Google account" />
            <Step n={2} label="Approve read + draft permissions" />
            <Step n={3} label="Done — comes back here automatically" />
          </div>

          {/* CTA */}
          <button
            onClick={connect}
            disabled={busy}
            className={[
              'mt-7 w-full h-12 rounded-xl',
              'font-mono text-[11px] font-bold tracking-widest uppercase',
              'bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.99]',
              'transition-all duration-150 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)]',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              'flex items-center justify-center gap-2',
            ].join(' ')}
          >
            {busy ? (
              <>
                <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Waiting for Google…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4.1h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.2-2 3.4-5 3.4-8.2z" />
                  <path d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 20.4 7.6 23 12 23z" />
                  <path d="M5.6 13.8c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V6.7H1.8C1 8.3.5 10.1.5 12s.5 3.7 1.3 5.3l3.8-3.5z" />
                  <path d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.8 15 1 12 1 7.6 1 3.7 3.6 1.8 7.4l3.8 2.9C6.5 7.4 9 5.4 12 5.4z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={busy}
            className="mt-3 w-full h-9 font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30"
          >
            Not now
          </button>

          {/* Safety strip */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[10px] text-slate-600 font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            Token stored locally · revoke anytime in Google account
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.025] border border-white/5">
      <span
        className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0 border border-amber-400/25"
        aria-hidden
      >
        {n}
      </span>
      <span className="text-[12px] text-slate-300">{label}</span>
    </div>
  );
}
