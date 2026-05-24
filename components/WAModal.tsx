'use client';

import { useState } from 'react';

interface WAModalProps {
  onClose: () => void;
  onSubmit: (data: { contact: string; message: string; context: string }) => void;
  isLoading: boolean;
}

export function WAModal({ onClose, onSubmit, isLoading }: WAModalProps) {
  const [form, setForm] = useState({ contact: '', message: '', context: '' });

  const canSubmit = form.contact.trim() && form.message.trim() && !isLoading;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#0d1318] border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-xs font-bold tracking-widest uppercase text-emerald-400">
            💬 Draft WhatsApp Reply
          </h2>
          <button onClick={onClose} className="font-mono text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Sender / Contact Name *">
            <input
              type="text"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="e.g. Liber Diaz, Randip Rai"
              className="w-full bg-[#070a0d] border border-slate-700 rounded px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-amber-500/60 placeholder:text-slate-700"
              autoFocus
            />
          </Field>

          <Field label="Message Received *">
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Paste the WhatsApp message here…"
              rows={5}
              className="w-full bg-[#070a0d] border border-slate-700 rounded px-3 py-2 font-mono text-xs text-slate-200 outline-none resize-none focus:border-amber-500/60 placeholder:text-slate-700"
            />
          </Field>

          <Field label="Additional Context (optional)">
            <input
              type="text"
              value={form.context}
              onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
              placeholder="e.g. This is about the Tabeer Homes October report"
              className="w-full bg-[#070a0d] border border-slate-700 rounded px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-amber-500/60 placeholder:text-slate-700"
            />
          </Field>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            disabled={!canSubmit}
            onClick={() => onSubmit(form)}
            className="flex-1 font-mono text-[10px] font-bold tracking-widest uppercase py-2.5 rounded bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '⟳ Drafting…' : '→ Generate Draft'}
          </button>
          <button
            onClick={onClose}
            className="font-mono text-[10px] font-bold tracking-widest uppercase py-2.5 px-4 rounded border border-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[9px] tracking-widest uppercase text-slate-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
