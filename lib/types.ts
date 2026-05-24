export type DraftStatus = 'pending' | 'sent' | 'archived';
export type DraftChannel = 'email' | 'whatsapp';
export type Priority = 'high' | 'medium' | 'low';

export interface Draft {
  id: string;
  channel: DraftChannel;
  from: string;
  subject: string;
  receivedAt: string;       // ISO – when original message arrived
  createdAt: string;        // ISO – when draft was created
  sentAt?: string;          // ISO – when marked sent
  snippet: string;          // first ~80 chars of original message
  originalMessage?: string; // full original (WhatsApp)
  priority: Priority;
  status: DraftStatus;
  // email-specific
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  // draft content
  draftPreview: string;     // first ~120 chars
  fullDraft: string;        // complete text
}

export interface LogEntry {
  id: string;
  msg: string;
  ts: string;               // display timestamp
  level: 'info' | 'success' | 'error';
}

// ── API request / response shapes ─────────────────────────

export interface ScanGmailResponse {
  drafts: Draft[];
  error?: string;
}

export interface DraftWhatsAppRequest {
  contact: string;
  message: string;
  context?: string;
}

export interface DraftWhatsAppResponse {
  draft: Draft;
  error?: string;
}

export interface RedraftRequest {
  draftId: string;
  currentDraft: string;
  from: string;
  subject: string;
  instruction: string;
}

export interface RedraftResponse {
  fullDraft: string;
  draftPreview: string;
  error?: string;
}
