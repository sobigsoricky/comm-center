'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Login failed');
      }
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unknown error');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#070a0d] text-slate-300 flex items-center justify-center p-4 font-mono">
      <form
        onSubmit={submit}
        className="bg-gradient-to-b from-[#0e1419] to-[#080b0f] border border-slate-700/70 rounded-2xl p-7 w-[400px] max-w-[92vw] shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
      >
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 text-2xl">
            ⬡
          </div>
          <h1
            className="text-white text-lg font-semibold"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Comm Center
          </h1>
          <p className="text-[11px] text-slate-500 tracking-widest uppercase">RankFast · Pranay Mishra</p>
        </div>

        <label className="block">
          <span className="block text-[11px] tracking-widest uppercase text-slate-500 mb-2">
            Password
          </span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            placeholder="••••••••"
            className="w-full bg-[#070a0d] border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 outline-none focus:border-amber-500/60 placeholder:text-slate-700"
          />
        </label>

        {err && (
          <p className="mt-3 text-[11px] text-red-400 text-center">{err}</p>
        )}

        <button
          type="submit"
          disabled={busy || !pw}
          className="mt-5 w-full h-11 rounded-lg bg-amber-500 text-black font-bold text-[11px] tracking-widest uppercase hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)]"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="mt-5 text-center text-[10px] text-slate-600 tracking-wide">
          Password is set via <code className="text-amber-400/80">APP_PASSWORD</code> env var
        </p>
      </form>
    </div>
  );
}
