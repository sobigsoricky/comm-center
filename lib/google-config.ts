// Google OAuth + Gmail API config. All secrets come from .env.local.

export const GOOGLE_OAUTH = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  // Must match exactly what's registered in Google Cloud Console → Credentials.
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3002/api/auth/google/callback',
};

// Minimum Gmail scopes needed: read messages + create/modify drafts.
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

// Where we persist the refresh token. Outside .next/, gitignored.
export const TOKEN_FILE = '.tokens/google.json';

// Max unread emails to draft per scan (avoid runaway costs).
export const MAX_EMAILS_PER_SCAN = 8;
