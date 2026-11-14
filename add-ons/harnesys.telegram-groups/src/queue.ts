import { attributedText, authorLabel } from './routing.ts';
import type { TelegramMessage } from './telegram.ts';

export const DEFAULT_INBOX_MAX_BATCH = 20;
export const DEFAULT_INBOX_MAX_CHARS = 3000;
export const DEFAULT_INBOX_MAX_BACKLOG = 50;
export const DEFAULT_INBOX_TTL_SEC = 3600;
export const DEFAULT_REPLY_MODE = 'auto';
export const DEFAULT_REPLY_WINDOW_SEC = 900;

export const ACTIVE_RUN_STATUSES: readonly string[] = [
  'queued',
  'running',
  'needs_input',
  'waiting',
];

export type ReplyMode = 'auto' | 'always' | 'never';

export interface InboxSettings {
  maxBatch: number;
  maxChars: number;
  maxBacklog: number;
  ttlSec: number;
  replyMode: ReplyMode;
  replyWindowSec: number;
  attribution: boolean;
}

export interface InboxEntry {
  id: number;
  messageId: number;
  at: number;
  message: TelegramMessage;
}

export interface BatchRender {
  text: string;
  kept: number;
  omitted: number;
}

export interface BacklogTrim<T> {
  kept: T[];
  dropped: number;
}

export interface FreshSplit {
  fresh: InboxEntry[];
  expired: InboxEntry[];
}

export interface ReplyAnchor {
  messageId: number;
  at: number;
}

export interface ReplyInput {
  mode: ReplyMode;
  anchor: ReplyAnchor | null;
  now: number;
  windowSec: number;
  originThreadId?: string;
  boundThreadId?: string;
}

export interface ReplyDecision {
  replyTo: number | null;
  clear: boolean;
}

export function batchLine(message: TelegramMessage, attribution: boolean): string {
  const raw = message.text ?? message.caption ?? '';
  const body = raw.length === 0 ? '[attachment]' : raw;
  if (!attribution) {
    return body;
  }
  const title = message.chat.title ?? message.chat.username ?? String(message.chat.id);
  return attributedText(authorLabel(message.from), title, body);
}

export function omittedHeader(count: number): string {
  return count > 0 ? `[+${count} earlier messages omitted]` : '';
}

function joinBatch(header: string, lines: string[]): string {
  const body = lines.join('\n');
  if (header.length === 0) {
    return body;
  }
  return body.length === 0 ? header : `${header}\n${body}`;
}

export function renderBatch(
  entries: InboxEntry[],
  attribution: boolean,
  maxChars: number,
  omittedBefore: number,
): BatchRender {
  const limit = Math.max(0, maxChars);
  const lines = entries.map((entry) => batchLine(entry.message, attribution));
  if (lines.length === 0) {
    return { text: omittedHeader(omittedBefore), kept: 0, omitted: omittedBefore };
  }
  for (let start = 0; start < lines.length; start += 1) {
    const omitted = omittedBefore + start;
    const text = joinBatch(omittedHeader(omitted), lines.slice(start));
    if (text.length <= limit) {
      return { text, kept: lines.length - start, omitted };
    }
  }
  const omitted = omittedBefore + lines.length - 1;
  const header = omittedHeader(omitted);
  const separator = header.length > 0 ? 1 : 0;
  const budget = limit - header.length - separator;
  const newest = lines.at(-1) ?? '';
  if (budget <= 0) {
    return { text: header.slice(0, limit), kept: 0, omitted };
  }
  return { text: joinBatch(header, [newest.slice(0, budget)]), kept: 1, omitted };
}

export function trimBacklog<T>(entries: T[], maxBacklog: number): BacklogTrim<T> {
  const limit = Math.max(0, Math.floor(maxBacklog));
  const dropped = Math.max(0, entries.length - limit);
  return { kept: dropped === 0 ? entries : entries.slice(dropped), dropped };
}

export function filterFresh(entries: InboxEntry[], now: number, ttlSec: number): FreshSplit {
  const cutoff = now - Math.max(0, ttlSec) * 1000;
  const fresh: InboxEntry[] = [];
  const expired: InboxEntry[] = [];
  for (const entry of entries) {
    if (entry.at < cutoff) {
      expired.push(entry);
    } else {
      fresh.push(entry);
    }
  }
  return { fresh, expired };
}

export function hasActiveRun(runs: Array<{ status: string }>): boolean {
  return runs.some((run) => ACTIVE_RUN_STATUSES.includes(run.status));
}

export function replyDecision(input: ReplyInput): ReplyDecision {
  const skip: ReplyDecision = { replyTo: null, clear: false };
  if (input.mode === 'never' || input.anchor === null) {
    return skip;
  }
  if (input.originThreadId === undefined || input.originThreadId !== input.boundThreadId) {
    return skip;
  }
  const age = input.now - input.anchor.at;
  if (age > Math.max(0, input.windowSec) * 1000) {
    return { replyTo: null, clear: true };
  }
  return { replyTo: input.anchor.messageId, clear: input.mode === 'auto' };
}
