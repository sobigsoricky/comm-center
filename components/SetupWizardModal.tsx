'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

interface SetupWizardModalProps {
  onClose: () => void;
}

interface SetupStep {
  id: string;
  title: string;
  detail: string;
  checklist: string[];
  command?: string;
}

interface SetupConfigState {
  commCenterAnthropicKey: string;
  whatsappAnthropicKey: string;
  whatsappPort: string;
  whatsappPollIntervalMs: string;
}

interface DiagnosticsState {
  summary: {
    healthy: number;
    setup_required: number;
    error: number;
  };
  checks: Array<{
    key: string;
    label: string;
    level: 'healthy' | 'setup_required' | 'error';
    detail: string;
    stepId: string;
    action: string;
    reason: string;
  }>;
  checkedAt: string;
}

const STEPS: SetupStep[] = [
  {
    id: 'keys',
    title: 'Add API keys',
    detail: 'Set your Anthropic API key in both apps so drafting endpoints can work.',
    checklist: [
      'Create comm-center/.env.local with ANTHROPIC_API_KEY',
      'Create whatsapp-bot/.env with ANTHROPIC_API_KEY',
      'Keep these files private (never commit keys)',
    ],
  },
  {
    id: 'comm-center',
    title: 'Start Comm Center app',
    detail: 'Launch the Next.js app to access the command center UI on localhost:3000.',
    checklist: [
      'Open terminal in comm-center/comm-center',
      'Run install once if needed',
      'Start dev server and open localhost:3000',
    ],
    command: 'npm install && npm run dev',
  },
  {
    id: 'gmail',
    title: 'Connect Gmail',
    detail:
      'One-time Google sign-in. Token is stored locally and auto-refreshes; you never sign in again unless you change your Google password.',
    checklist: [
      'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (see SETUP.md)',
      'Click "Connect Gmail" below — opens Google in a popup',
      'Approve the read + compose-drafts scopes',
      'Use "Scan Gmail" and confirm drafts appear in queue',
    ],
  },
  {
    id: 'bot-install',
    title: 'Prepare WhatsApp bot',
    detail: 'Install dependencies and Chromium for browser automation in whatsapp-bot.',
    checklist: [
      'Open terminal in comm-center/whatsapp-bot',
      'Install dependencies',
      'Install Playwright Chromium',
    ],
    command: 'npm install && npx playwright install chromium',
  },
  {
    id: 'wa-auth',
    title: 'Authenticate WhatsApp once',
    detail: 'Run setup script, scan QR code from WhatsApp mobile app, and save auth session.',
    checklist: [
      'Run node setup.js',
      'On phone: WhatsApp > Linked Devices > Link a Device',
      'Scan QR and wait for success message',
    ],
    command: 'node setup.js',
  },
  {
    id: 'run-bot',
    title: 'Run WhatsApp bot',
    detail: 'Start bot and open dashboard to approve/edit/send generated replies.',
    checklist: [
      'Run node index.js (or node index.js --visible for debugging)',
      'Open localhost:3001',
      'Confirm message drafts arrive and send works',
    ],
    command: 'node index.js',
  },
];

const STEP_INDEX_BY_ID: Record<string, number> = STEPS.reduce<Record<string, number>>((acc, step, index) => {
  acc[step.id] = index;
  return acc;
}, {});

export function SetupWizardModal({ onClose }: SetupWizardModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<SetupConfigState>({
    commCenterAnthropicKey: '',
    whatsappAnthropicKey: '',
    whatsappPort: '3001',
    whatsappPollIntervalMs: '8000',
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(true);
  const [copied, setCopied] = useState('');

  // Gmail OAuth state — handlers defined further below so they can reference loadDiagnostics
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const completedCount = useMemo(() => STEPS.filter((s) => done[s.id]).length, [done]);
  const progressPct = Math.round((completedCount / STEPS.length) * 100);

  const toggleDone = (id: string) => {
    setDone((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/setup-config');
        const data = await res.json();
        setForm({
          commCenterAnthropicKey: '',
          whatsappAnthropicKey: '',
          whatsappPort: data?.whatsappBot?.port ?? '3001',
          whatsappPollIntervalMs: data?.whatsappBot?.pollIntervalMs ?? '8000',
        });
        setDone((prev) => ({
          ...prev,
          keys: Boolean(data?.commCenter?.hasAnthropicKey && data?.whatsappBot?.hasAnthropicKey),
        }));
      } catch {
        // keep defaults; user can still input manually
      } finally {
        setLoadingConfig(false);
      }
    };
    void load();
  }, []);

  const loadDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await fetch('/api/setup-diagnostics', { cache: 'no-store' });
      const data = await res.json();
      setDiagnostics(data as DiagnosticsState);
    } catch {
      setDiagnostics(null);
    } finally {
      setLoadingDiagnostics(false);
    }
  }, []);

  const refreshGmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/google/status', { cache: 'no-store' });
      const data = await res.json();
      setGmailConnected(Boolean(data.connected));
    } catch {
      setGmailConnected(false);
    }
  }, []);

  // Initial mount: fetch diagnostics + Gmail status, subscribe to OAuth popup postMessage.
  // The rule flags mount-time fetches as cascading-render-prone; for a one-shot setup wizard
  // the trade-off is fine and the alternative (Suspense/SWR) is overkill here.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadDiagnostics();
    void refreshGmailStatus();
    /* eslint-enable react-hooks/set-state-in-effect */
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'gmail-connected') {
        void refreshGmailStatus();
        void loadDiagnostics();
        setDone((prev) => ({ ...prev, gmail: true }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadDiagnostics, refreshGmailStatus]);

  const connectGmail = useCallback(() => {
    setGmailBusy(true);
    // Try popup first
    const popup = window.open('/api/auth/google', 'gmail-auth', 'width=500,height=700,noopener=no');

    // Popup blocked? Fall back to same-tab navigation.
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/api/auth/google';
      return;
    }

    // Try to focus the popup (some browsers open it in the background)
    try {
      popup.focus();
    } catch {
      // ignore
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setGmailBusy(false);
        void refreshGmailStatus();
        void loadDiagnostics();
      }
    }, 500);
  }, [loadDiagnostics, refreshGmailStatus]);

  const disconnectGmail = useCallback(async () => {
    setGmailBusy(true);
    try {
      await fetch('/api/auth/google/status', { method: 'DELETE' });
      await refreshGmailStatus();
      await loadDiagnostics();
      setDone((prev) => ({ ...prev, gmail: false }));
    } finally {
      setGmailBusy(false);
    }
  }, [loadDiagnostics, refreshGmailStatus]);

  const copyCommand = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(step.id);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      // no-op if clipboard access is blocked
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    setSaveStatus('');
    try {
      const res = await fetch('/api/setup-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to save config');
      }
      setDone((prev) => ({ ...prev, keys: true }));
      setSaveStatus('Saved successfully. Restart servers to apply new env values.');
      void loadDiagnostics();
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : 'Could not save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[860px] max-w-[98vw] max-h-[92vh] bg-[#111317] border border-white/10 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 bg-[#15181d]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-wide uppercase text-sky-300/80">Guided Setup</p>
              <h2 className="text-lg text-white font-semibold">Comm Center Configuration</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>
          <div className="mt-4">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-slate-300">
              {completedCount}/{STEPS.length} steps completed ({progressPct}%)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[250px_1fr] min-h-[470px] max-h-[68vh]">
          <aside className="border-r border-white/10 p-4 overflow-y-auto bg-[#13161b]">
            {STEPS.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setStepIndex(idx)}
                className={clsx(
                  'w-full text-left rounded-xl p-3 mb-2 border transition-colors',
                  idx === stepIndex
                    ? 'bg-sky-400/10 border-sky-300/30'
                    : 'bg-transparent border-transparent hover:bg-white/5'
                )}
              >
                <p className="text-[11px] text-slate-400">Step {idx + 1}</p>
                <p className="text-[13px] text-slate-100 font-medium">{s.title}</p>
                {done[s.id] && <p className="text-[11px] text-emerald-300 mt-1">Completed</p>}
              </button>
            ))}
          </aside>

          <section className="p-6 overflow-y-auto">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Diagnostics</p>
                  <p className="text-[13px] text-slate-200">Live setup health and readiness checks</p>
                </div>
                <button
                  onClick={() => void loadDiagnostics()}
                  disabled={loadingDiagnostics}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                >
                  {loadingDiagnostics ? 'Checking...' : 'Refresh'}
                </button>
              </div>

              {diagnostics && (
                <>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <StatusPill label={`${diagnostics.summary.healthy} healthy`} tone="healthy" />
                    <StatusPill label={`${diagnostics.summary.setup_required} setup required`} tone="setup_required" />
                    <StatusPill label={`${diagnostics.summary.error} errors`} tone="error" />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Last checked: {new Date(diagnostics.checkedAt).toLocaleTimeString()}
                  </p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {diagnostics.checks.map((check) => (
                      <button
                        key={check.key}
                        onClick={() => {
                          const next = STEP_INDEX_BY_ID[check.stepId];
                          if (typeof next === 'number') setStepIndex(next);
                        }}
                        className="rounded-lg border border-white/10 bg-black/20 p-3 text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] text-slate-100">{check.label}</p>
                          <StatusPill label={check.level} tone={check.level} compact />
                        </div>
                        <p className="text-[12px] text-slate-400 mt-1">{check.detail}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{check.reason}</p>
                        {(check.level === 'setup_required' || check.level === 'error') && (
                          <p className="text-[12px] text-sky-300 mt-2">
                            Next: {check.action}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!diagnostics && !loadingDiagnostics && (
                <p className="mt-3 text-[12px] text-rose-300">Diagnostics unavailable right now. Try refresh.</p>
              )}
            </div>

            <p className="text-[12px] text-slate-400">Step {stepIndex + 1}</p>
            <h3 className="text-xl text-white font-semibold mt-1">{step.title}</h3>
            <p className="text-[14px] text-slate-300 mt-2 leading-relaxed">{step.detail}</p>

            {step.id === 'keys' && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                {loadingConfig ? (
                  <p className="text-sm text-slate-400">Loading current configuration...</p>
                ) : (
                  <>
                    <InputField
                      label="Comm Center Anthropic API Key"
                      type="password"
                      placeholder="sk-ant-..."
                      value={form.commCenterAnthropicKey}
                      onChange={(value) => setForm((prev) => ({ ...prev, commCenterAnthropicKey: value }))}
                    />
                    <InputField
                      label="WhatsApp Bot Anthropic API Key"
                      type="password"
                      placeholder="sk-ant-..."
                      value={form.whatsappAnthropicKey}
                      onChange={(value) => setForm((prev) => ({ ...prev, whatsappAnthropicKey: value }))}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <InputField
                        label="WhatsApp Bot Port"
                        placeholder="3001"
                        value={form.whatsappPort}
                        onChange={(value) => setForm((prev) => ({ ...prev, whatsappPort: value }))}
                      />
                      <InputField
                        label="Polling Interval (ms)"
                        placeholder="8000"
                        value={form.whatsappPollIntervalMs}
                        onChange={(value) => setForm((prev) => ({ ...prev, whatsappPollIntervalMs: value }))}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveConfig}
                        disabled={savingConfig}
                        className="text-[12px] font-medium px-4 py-2 rounded-lg bg-sky-400 text-[#071018] hover:bg-sky-300 disabled:opacity-50"
                      >
                        {savingConfig ? 'Saving...' : 'Save Configuration'}
                      </button>
                      {saveStatus && (
                        <p className={clsx('text-[12px]', saveStatus.startsWith('Saved') ? 'text-emerald-300' : 'text-rose-300')}>
                          {saveStatus}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {step.id === 'gmail' && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] text-slate-300">Gmail account</p>
                    <p className="text-[14px] text-white font-medium mt-0.5">
                      {gmailConnected === null
                        ? 'Checking…'
                        : gmailConnected
                          ? 'Connected — tokens stored locally, auto-refreshes'
                          : 'Not connected'}
                    </p>
                  </div>
                  {gmailConnected ? (
                    <button
                      onClick={disconnectGmail}
                      disabled={gmailBusy}
                      className="text-[12px] font-medium px-4 py-2 rounded-lg bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                    >
                      {gmailBusy ? 'Working…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={connectGmail}
                      disabled={gmailBusy}
                      className="text-[12px] font-medium px-4 py-2 rounded-lg bg-sky-400 text-[#071018] hover:bg-sky-300 disabled:opacity-50"
                    >
                      {gmailBusy ? 'Opening Google…' : 'Connect Gmail'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Need credentials? See <code className="text-sky-300">SETUP.md</code> for the
                  5-minute Google Cloud Console steps.
                </p>
              </div>
            )}

            <div className="mt-5 space-y-2">
              {step.checklist.map((item, idx) => (
                <div key={`${step.id}_${idx}`} className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-500">•</span>
                  <p className="text-[14px] text-slate-200">{item}</p>
                </div>
              ))}
            </div>

            {step.command && (
              <div className="mt-5 rounded-xl border border-white/10 bg-[#0d1014] p-4">
                <p className="text-[11px] tracking-wide uppercase text-slate-400 mb-2">Run Command</p>
                <code className="text-[13px] text-sky-200 break-all">{step.command}</code>
                <div className="mt-3">
                  <button
                    onClick={() => copyCommand(step.command!)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-white/10 text-slate-200 hover:bg-white/15"
                  >
                    {copied === step.id ? 'Copied' : 'Copy Command'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => toggleDone(step.id)}
                className={clsx(
                  'text-[12px] font-medium px-3 py-1.5 rounded-lg border',
                  done[step.id]
                    ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-slate-200'
                )}
              >
                {done[step.id] ? 'Completed' : 'Mark as Complete'}
              </button>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-[#15181d] flex justify-between">
          <button
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="text-[12px] font-medium px-4 py-2 rounded-lg bg-white/10 text-slate-100 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => (isLast ? onClose() : setStepIndex((i) => Math.min(STEPS.length - 1, i + 1)))}
            className="text-[12px] font-medium px-4 py-2 rounded-lg bg-sky-400 text-[#071018] hover:bg-sky-300"
          >
            {isLast ? 'Finish Setup' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <label className="block">
      <span className="block text-[12px] text-slate-300 mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-[#0b0e12] px-3 py-2 text-[14px] text-slate-100 outline-none focus:border-sky-400/70"
      />
    </label>
  );
}

function StatusPill({
  label,
  tone,
  compact = false,
}: {
  label: string;
  tone: 'healthy' | 'setup_required' | 'error';
  compact?: boolean;
}) {
  const toneClass =
    tone === 'healthy'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
      : tone === 'setup_required'
      ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
      : 'bg-rose-500/15 text-rose-300 border-rose-400/30';

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-medium',
        compact ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1',
        toneClass
      )}
    >
      {label}
    </span>
  );
}
