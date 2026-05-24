# Comm Center — One-Time Setup

This is the **one-time** setup. After this, the dashboard runs forever with zero interaction.

Estimated time: **10 minutes total** (Google Cloud Console is the bulk of it).

---

## 1. Anthropic API key (2 min)

1. Go to https://console.anthropic.com → **API Keys** → **Create Key**.
2. Copy the `sk-ant-...` value.
3. In `comm-center/.env.local` (create if missing), add:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

> Already done if you used the Setup Wizard step 1.

---

## 2. Google Cloud OAuth credentials (5–7 min, one-time forever)

You need to create a tiny Google Cloud project so the app can ask Google for permission to read your Gmail. **You only do this once. Ever.**

### 2a. Create the project

1. Go to https://console.cloud.google.com.
2. Top-left dropdown → **New Project**.
3. Name: `Comm Center` (anything works). Click **Create**.
4. Wait ~10 seconds, then make sure that project is selected in the top dropdown.

### 2b. Enable the Gmail API

1. Sidebar → **APIs & Services** → **Library**.
2. Search **Gmail API** → click it → **Enable**.

### 2c. Configure the OAuth consent screen

1. Sidebar → **APIs & Services** → **OAuth consent screen**.
2. User Type: **External** → Create.
3. Fill the required fields:
   - App name: `Comm Center`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through Scopes (skip) and Test users.
5. On **Test users**, click **Add Users** and add your own Gmail address. Save.

> The "External + Testing" mode is fine forever for personal use. You don't need to publish.

### 2d. Create the OAuth client ID

1. Sidebar → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Comm Center Dashboard`.
5. **Authorized redirect URIs** → **Add URI** → paste:
   ```
   http://localhost:3002/api/auth/google/callback
   ```
6. Click **Create**.
7. A modal pops up with your **Client ID** and **Client secret**. Copy both.

### 2e. Paste into `.env.local`

Add to `comm-center/.env.local`:
```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## 3. Connect Gmail (30 seconds)

1. Start the app: `npm run dev` (or use the preview/launch config).
2. Open http://localhost:3002.
3. Click **⚙ Setup** in the top right.
4. Go to the **Connect Gmail** step.
5. Click **Connect Gmail**. A popup opens.
6. Sign in with the Gmail account you added as a test user.
7. Click **Allow** on the consent screen ("Read your email" + "Manage drafts").
8. Popup closes. You're done.

The refresh token is saved at `comm-center/.tokens/google.json`. **Don't commit this file** — it's already in `.gitignore`.

---

## 4. Verify it works

In the dashboard, click **⟳ Scan Gmail**. Within a few seconds you should see drafts appearing in the queue, and matching Gmail drafts saved in your inbox.

If you see *"Gmail not connected"*, redo step 3.
If you see *"GOOGLE_CLIENT_ID not set"*, redo step 2e.

---

## Deploy to Railway (cloud — works without your laptop)

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this repo.
3. Railway auto-detects Next.js via Nixpacks + `railway.json`. First build takes ~3 minutes.
4. After deploy, click **Settings** → **Networking** → **Generate Domain**. You'll get something like `comm-center-production.up.railway.app`.
5. Add these env vars (Settings → Variables):
   ```
   ANTHROPIC_API_KEY        = sk-ant-...
   GOOGLE_CLIENT_ID         = ...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET     = GOCSPX-...
   GOOGLE_REDIRECT_URI      = https://<your-railway-domain>/api/auth/google/callback
   ```
6. In Google Cloud Console → Credentials → your OAuth client → **Authorized redirect URIs** → add the same `https://<your-railway-domain>/api/auth/google/callback` (keep the localhost one too).
7. ⚠ **Add a persistent volume**: Railway → your service → **Settings** → **Volumes** → **+ New Volume** → mount path: `/app/.tokens`. Without this, the Gmail refresh token gets wiped on every redeploy.
8. Wait for the deploy to redeploy after env vars are saved. Open your Railway URL, click ⚙ Setup → Connect Gmail.

That's it — it now runs 24/7 in the cloud.

---

## Auto-start at Windows login

I included a one-shot installer. From a regular PowerShell:

```powershell
cd "C:\Users\prana\OneDrive\Documents\Claude Code\comm-center\comm-center"
.\install-autostart.ps1
```

This:
- Registers a Windows scheduled task named `CommCenter`
- Runs `start.bat` automatically when you log in
- Auto-restarts up to 5 times if it crashes
- Survives reboots

After install, control it via:
```powershell
Start-ScheduledTask    -TaskName CommCenter   # start now
Stop-ScheduledTask     -TaskName CommCenter   # stop
Get-ScheduledTask      -TaskName CommCenter | Get-ScheduledTaskInfo   # check
Unregister-ScheduledTask -TaskName CommCenter -Confirm:$false   # remove
```

The dashboard always lives at **http://localhost:3002**.

---

## Maintenance you'll hit (and what to do)

| What | When | Fix |
|---|---|---|
| Anthropic key rotation | If exposed | Update `ANTHROPIC_API_KEY` in `.env.local`, restart |
| Gmail token expired | If you don't use it for 6 months | Click ⚙ Setup → Disconnect → Connect Gmail |
| OAuth consent expired | After ~7 days while still in Testing mode | Reconsent at consent screen (Google emails a reminder) |
| Sonnet model deprecated | Anthropic announces ~6mo ahead | Update `CLAUDE_MODEL` in `lib/constants.ts` |

---

## Gotchas

- **The redirect URI must match exactly.** `localhost` vs `127.0.0.1`, trailing slash, port number — all matter. If you change the port, update both `.env.local` (`GOOGLE_REDIRECT_URI`) and Google Cloud Console.
- **Test mode tokens expire every 7 days** for non-verified apps. Either keep using it weekly, or publish the app (one button in Google Console, no review needed for sensitive scopes if used only by you).
- **Don't share `.tokens/google.json`** — it's an unlocked door to your Gmail. Already gitignored.
