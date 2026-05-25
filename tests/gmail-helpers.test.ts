import { describe, it, expect } from 'vitest';
import {
  rangeToQuery,
  headerValue,
  decodeBase64Url,
  extractPlainBody,
} from '@/lib/gmail';

describe('rangeToQuery', () => {
  it('maps known ranges', () => {
    expect(rangeToQuery('7d')).toBe('newer_than:7d');
    expect(rangeToQuery('30d')).toBe('newer_than:30d');
    expect(rangeToQuery('90d')).toBe('newer_than:90d');
    expect(rangeToQuery('1y')).toBe('newer_than:1y');
    expect(rangeToQuery('2y')).toBe('newer_than:2y');
  });

  it('returns empty string for "all"', () => {
    expect(rangeToQuery('all')).toBe('');
  });

  it('falls back to empty for unknown (defensive)', () => {
    // TS would block this; cast to test the default branch
    expect(rangeToQuery('bogus' as unknown as '7d')).toBe('');
  });
});

describe('headerValue', () => {
  it('returns the matching header (case-insensitive)', () => {
    const headers = [
      { name: 'From', value: 'a@b.com' },
      { name: 'Subject', value: 'hi' },
    ];
    expect(headerValue(headers, 'from')).toBe('a@b.com');
    expect(headerValue(headers, 'FROM')).toBe('a@b.com');
    expect(headerValue(headers, 'Subject')).toBe('hi');
  });

  it('returns empty string when undefined headers', () => {
    expect(headerValue(undefined, 'From')).toBe('');
  });

  it('returns empty string when header missing', () => {
    expect(headerValue([{ name: 'X', value: 'y' }], 'Missing')).toBe('');
  });

  it('handles header with null value', () => {
    expect(headerValue([{ name: 'X', value: null }], 'X')).toBe('');
  });

  it('handles header with undefined name', () => {
    expect(headerValue([{ value: 'orphan' }], 'X')).toBe('');
  });
});

describe('decodeBase64Url', () => {
  it('decodes standard base64', () => {
    const b64 = Buffer.from('hello').toString('base64');
    expect(decodeBase64Url(b64)).toBe('hello');
  });

  it('decodes URL-safe base64 with -/_ replacements', () => {
    // "subjects?>>" contains chars that produce - and _ in URL-safe base64
    const original = 'a>?b';
    const urlSafe = Buffer.from(original)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(decodeBase64Url(urlSafe)).toBe(original);
  });

  it('decodes UTF-8 multi-byte chars (emoji)', () => {
    const b64 = Buffer.from('hi 👋', 'utf8').toString('base64');
    expect(decodeBase64Url(b64)).toBe('hi 👋');
  });

  it('returns empty string for empty input', () => {
    expect(decodeBase64Url('')).toBe('');
  });
});

describe('extractPlainBody', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

  it('extracts text/plain top-level body', () => {
    const payload = { mimeType: 'text/plain', body: { data: b64('hello world') } };
    expect(extractPlainBody(payload)).toBe('hello world');
  });

  it('prefers text/plain part inside multipart', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64('<b>html</b>') } },
        { mimeType: 'text/plain', body: { data: b64('plain text') } },
      ],
    };
    expect(extractPlainBody(payload)).toBe('plain text');
  });

  it('recurses into nested multipart', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: b64('nested') } }],
        },
      ],
    };
    expect(extractPlainBody(payload)).toBe('nested');
  });

  it('falls back to top-level body with HTML stripped if no text/plain', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64('<p>Hello <b>world</b></p>') },
    };
    expect(extractPlainBody(payload)).toBe('Hello world');
  });

  it('returns empty for empty payload', () => {
    expect(extractPlainBody(undefined)).toBe('');
    expect(extractPlainBody({})).toBe('');
  });

  it('returns empty for parts with no data', () => {
    expect(extractPlainBody({ parts: [{ mimeType: 'text/plain' }] })).toBe('');
  });
});
