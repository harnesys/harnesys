import type {
  GoogleGmailAttachmentMeta,
  GoogleGmailMessage,
  GoogleGmailMessageSummary,
  GoogleGmailSendInput,
  GoogleGmailThread,
} from 'harnesys';
import { asGoogleRecord, googleApiJson, stringField } from './google-http.ts';

const GMAIL_API_BASE = '/gmail/v1/users/me';
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 25;

export async function searchGmailMessages(
  token: string,
  query: string,
  maxResults?: number,
): Promise<GoogleGmailMessageSummary[]> {
  const limit = Math.min(Math.max(1, maxResults ?? DEFAULT_MAX_RESULTS), MAX_RESULTS_LIMIT);
  const listQuery = new URLSearchParams({ q: query, maxResults: String(limit) });
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${GMAIL_API_BASE}/messages`,
    query: listQuery,
  });
  const items = Array.isArray(res.messages) ? res.messages : [];
  return Promise.all(
    items.map((item) => {
      const id = stringField(asGoogleRecord(item), 'id') ?? '';
      return gmailMessageSummary(token, id);
    }),
  );
}

export async function getGmailMessage(
  token: string,
  messageId: string,
): Promise<GoogleGmailMessage> {
  const raw = await fetchMessage(token, messageId, 'full');
  return gmailMessageOf(raw);
}

export async function getGmailThread(token: string, threadId: string): Promise<GoogleGmailThread> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}`,
    query: new URLSearchParams({ format: 'full' }),
  });
  const items = Array.isArray(res.messages) ? res.messages : [];
  return {
    id: stringField(res, 'id') ?? threadId,
    messages: items.map((item) => gmailMessageOf(asGoogleRecord(item))),
  };
}

export async function getGmailAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<{ bytes: Buffer; size: number }> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path:
      `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}` +
      `/attachments/${encodeURIComponent(attachmentId)}`,
  });
  const data = stringField(res, 'data') ?? '';
  return {
    bytes: Buffer.from(data, 'base64url'),
    size: sizeOf(res),
  };
}

export async function sendGmailMessage(
  token: string,
  input: GoogleGmailSendInput,
): Promise<{ id: string; threadId: string }> {
  const raw = Buffer.from(buildTextMime(input), 'utf8').toString('base64url');
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${GMAIL_API_BASE}/messages/send`,
    body: { raw },
  });
  return {
    id: stringField(res, 'id') ?? '',
    threadId: stringField(res, 'threadId') ?? '',
  };
}

export interface TextMimeInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

const HEADER_LINE_LIMIT = 76;

export function buildTextMime(input: TextMimeInput): string {
  const headers = [
    `To: ${sanitizeHeader(input.to)}`,
    ...(input.cc !== undefined && input.cc !== '' ? [`Cc: ${sanitizeHeader(input.cc)}`] : []),
    ...foldHeader(`Subject: ${encodeMimeHeader(input.subject)}`),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${normalizeBody(input.body)}`;
}

export function foldHeader(line: string, limit = HEADER_LINE_LIMIT): string[] {
  if (line.length <= limit) {
    return [line];
  }
  const [head = '', ...words] = line.split(' ');
  const lines: string[] = [];
  let current = head;
  for (const word of words) {
    if (current.length > 0 && current.length + 1 + word.length > limit) {
      lines.push(current);
      current = ` ${word}`;
      continue;
    }
    current = `${current} ${word}`;
  }
  lines.push(current);
  return lines;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

const ENCODED_WORD_MAX = 75;

function encodeMimeHeader(value: string): string {
  const sanitized = sanitizeHeader(value);
  if (!/[^\x20-\x7E]/.test(sanitized)) {
    return sanitized;
  }
  const prefix = '=?UTF-8?B?';
  const suffix = '?=';
  const maxChunkBytes = Math.floor((ENCODED_WORD_MAX - prefix.length - suffix.length) / 4) * 3;
  const bytes = Buffer.from(sanitized, 'utf8');
  const words: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += maxChunkBytes) {
    const chunk = bytes.subarray(offset, offset + maxChunkBytes).toString('base64');
    words.push(`${prefix}${chunk}${suffix}`);
  }
  return words.join(' ');
}

function normalizeBody(body: string): string {
  return body.replace(/\r?\n/g, '\r\n');
}

async function gmailMessageSummary(
  token: string,
  messageId: string,
): Promise<GoogleGmailMessageSummary> {
  const raw = await fetchMessage(token, messageId, 'metadata');
  const headers = headersOf(raw);
  return {
    id: messageId,
    threadId: stringField(raw, 'threadId') ?? '',
    snippet: stringField(raw, 'snippet') ?? '',
    subject: headers.get('Subject') ?? '',
    from: headers.get('From') ?? '',
    date: headers.get('Date') ?? '',
  };
}

async function fetchMessage(
  token: string,
  messageId: string,
  format: 'full' | 'metadata',
): Promise<Record<string, unknown>> {
  return googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}`,
    query: new URLSearchParams({ format }),
  });
}

function gmailMessageOf(raw: Record<string, unknown>): GoogleGmailMessage {
  const headers = headersOf(raw);
  const payload = asGoogleRecord(raw.payload);
  return {
    id: stringField(raw, 'id') ?? '',
    threadId: stringField(raw, 'threadId') ?? '',
    snippet: stringField(raw, 'snippet') ?? '',
    from: headers.get('From') ?? '',
    to: headers.get('To') ?? '',
    cc: headers.get('Cc') ?? '',
    subject: headers.get('Subject') ?? '',
    date: headers.get('Date') ?? '',
    body: extractTextBody(payload),
    attachments: extractGmailAttachments(payload),
  };
}

export function extractGmailAttachments(
  payload: Record<string, unknown>,
): GoogleGmailAttachmentMeta[] {
  const found: GoogleGmailAttachmentMeta[] = [];
  walkGmailParts(payload, found);
  return found;
}

function walkGmailParts(part: Record<string, unknown>, found: GoogleGmailAttachmentMeta[]): void {
  const filename = stringField(part, 'filename');
  const body = asGoogleRecord(part.body);
  const attachmentId = stringField(body, 'attachmentId');
  if (filename !== null && filename !== '' && attachmentId !== null) {
    const size = body.size;
    found.push({
      attachmentId,
      filename,
      mimeType: stringField(part, 'mimeType') ?? 'application/octet-stream',
      size: typeof size === 'number' ? size : 0,
    });
  }
  const parts = Array.isArray(part.parts) ? part.parts : [];
  for (const child of parts) {
    walkGmailParts(asGoogleRecord(child), found);
  }
}

function sizeOf(record: Record<string, unknown>): number {
  const size = record.size;
  return typeof size === 'number' ? size : 0;
}

function headersOf(raw: Record<string, unknown>): Map<string, string> {
  const payload = asGoogleRecord(raw.payload);
  const list = Array.isArray(payload.headers) ? payload.headers : [];
  const headers = new Map<string, string>();
  for (const entry of list) {
    const header = asGoogleRecord(entry);
    const name = stringField(header, 'name');
    const value = stringField(header, 'value');
    if (name !== null && value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function extractTextBody(payload: Record<string, unknown>): string {
  const mimeType = stringField(payload, 'mimeType');
  const body = asGoogleRecord(payload.body);
  const data = stringField(body, 'data');
  if (mimeType === 'text/plain' && typeof data === 'string') {
    return decodeBase64Url(data);
  }
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  for (const part of parts) {
    const text = extractTextBody(asGoogleRecord(part));
    if (text !== '') {
      return text;
    }
  }
  return '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}
