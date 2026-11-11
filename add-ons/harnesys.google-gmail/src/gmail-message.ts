import { AddonError } from '@harnesys/sdk';
import { decodeBase64Url } from './gmail-client.ts';

export interface GmailHeaderWire {
  name?: string;
  value?: string;
}

export interface GmailBodyWire {
  attachmentId?: string;
  size?: number;
  data?: string;
}

export interface GmailPartWire {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeaderWire[];
  body?: GmailBodyWire;
  parts?: GmailPartWire[];
}

export interface GmailMessageWire {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPartWire;
}

export interface GmailThreadWire {
  id?: string;
  messages?: GmailMessageWire[];
}

export interface GmailAttachmentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailMessageSummary extends GmailMessageMeta {
  to: string;
  cc: string;
  body: string;
  attachments: GmailAttachmentRef[];
}

export function messageMetaOf(wire: GmailMessageWire): GmailMessageMeta {
  const headers = wire.payload?.headers ?? [];
  return {
    id: requiredId(wire.id, 'message'),
    threadId: typeof wire.threadId === 'string' ? wire.threadId : '',
    subject: headerOf(headers, 'subject'),
    from: headerOf(headers, 'from'),
    date: headerOf(headers, 'date') || internalDateOf(wire),
    snippet: typeof wire.snippet === 'string' ? wire.snippet : '',
  };
}

export function messageSummaryOf(wire: GmailMessageWire): GmailMessageSummary {
  const headers = wire.payload?.headers ?? [];
  return {
    ...messageMetaOf(wire),
    to: headerOf(headers, 'to'),
    cc: headerOf(headers, 'cc'),
    body: plainTextOf(wire.payload).trim(),
    attachments: attachmentsOf(wire.payload),
  };
}

export function threadMessagesOf(thread: GmailThreadWire): GmailMessageSummary[] {
  return (thread.messages ?? []).map(messageSummaryOf);
}

function requiredId(value: string | undefined, kind: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new AddonError('invalid_response', { detail: `Gmail ${kind} has no id` });
  }
  return value;
}

function headerOf(headers: GmailHeaderWire[], name: string): string {
  const wanted = name.toLowerCase();
  for (const header of headers) {
    if (typeof header.name === 'string' && header.name.toLowerCase() === wanted) {
      return typeof header.value === 'string' ? header.value : '';
    }
  }
  return '';
}

function internalDateOf(wire: GmailMessageWire): string {
  if (typeof wire.internalDate !== 'string' || wire.internalDate === '') {
    return '';
  }
  const ms = Number(wire.internalDate);
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString();
}

function plainTextOf(part: GmailPartWire | undefined): string {
  if (part === undefined) {
    return '';
  }
  const data = part.body?.data;
  if (part.mimeType === 'text/plain' && typeof data === 'string' && data !== '') {
    return new TextDecoder().decode(decodeBase64Url(data));
  }
  for (const child of part.parts ?? []) {
    const text = plainTextOf(child);
    if (text !== '') {
      return text;
    }
  }
  return '';
}

function attachmentsOf(part: GmailPartWire | undefined): GmailAttachmentRef[] {
  if (part === undefined) {
    return [];
  }
  const found: GmailAttachmentRef[] = [];
  const attachmentId = part.body?.attachmentId;
  if (typeof attachmentId === 'string' && attachmentId !== '') {
    found.push({
      attachmentId,
      filename:
        typeof part.filename === 'string' && part.filename !== '' ? part.filename : attachmentId,
      mimeType: typeof part.mimeType === 'string' ? part.mimeType : 'application/octet-stream',
      size: typeof part.body?.size === 'number' ? part.body.size : 0,
    });
  }
  for (const child of part.parts ?? []) {
    found.push(...attachmentsOf(child));
  }
  return found;
}
