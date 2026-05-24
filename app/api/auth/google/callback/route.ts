import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/gmail';

// GET /api/auth/google/callback?code=... → store tokens, redirect home
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return new NextResponse(authResultHtml(`Google denied access: ${error}`, false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!code) {
    return new NextResponse(authResultHtml('No authorization code in callback.', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    await exchangeCodeForTokens(code);
    return new NextResponse(authResultHtml('Gmail connected. You can close this tab.', true), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new NextResponse(authResultHtml(msg, false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function authResultHtml(message: string, success: boolean): string {
  const color = success ? '#22c55e' : '#ef4444';
  const icon = success ? '✓' : '✗';
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Comm Center — Gmail Auth</title>
<style>
  body { background:#070a0d; color:#c9d5e0; font-family: 'IBM Plex Mono', monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { background:#0d1318; border:1px solid #1a2530; border-radius:6px; padding:32px 40px; text-align:center; max-width:480px; }
  .icon { font-size:48px; color:${color}; margin-bottom:16px; }
  .msg { font-size:14px; line-height:1.6; color:#c9d5e0; }
  .hint { font-size:11px; color:#4a6278; margin-top:24px; letter-spacing:0.06em; text-transform:uppercase; }
  a { color:#f59e0b; text-decoration:none; }
</style>
</head><body>
<div class="card">
  <div class="icon">${icon}</div>
  <div class="msg">${escapeHtml(message)}</div>
  <div class="hint">Comm Center · <a href="/">Back to dashboard</a></div>
</div>
<script>
  if (${success}) {
    // Popup mode: notify opener and close
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage({ type: 'gmail-connected' }, '*'); } catch {}
      setTimeout(() => { try { window.close(); } catch {} }, 1200);
    } else {
      // Same-tab mode: redirect back to dashboard
      setTimeout(() => { window.location.href = '/'; }, 1500);
    }
  }
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
