import type { SessionEvent } from '../../ports/session.ts';
import type {
  ThreadHistoryMessage,
  ThreadHistoryPage,
  ThreadHistoryQuery,
  ThreadSearchQuery,
  ThreadSearchResult,
} from '../../ports/threads.ts';

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;
const SNIPPET_MAX_CHARS = 320;

export function readThreadHistory(
  events: SessionEvent[],
  threadId: string,
  query: ThreadHistoryQuery,
): ThreadHistoryPage {
  const limit = clampHistoryLimit(query.limit);
  const conversational = conversationalMessages(events, threadId);
  const before = finiteOr(query.beforeSeq, Number.MAX_SAFE_INTEGER);
  const older = conversational.filter((message) => message.threadSeq < before);
  const slice = older.slice(-limit);
  return {
    messages: slice,
    hasMore: older.length > slice.length,
    oldestSeq: slice[0]?.threadSeq ?? null,
  };
}

export function searchThreadHistory(
  events: SessionEvent[],
  threadId: string,
  query: ThreadSearchQuery,
): ThreadSearchResult {
  const limit = clampSearchLimit(query.limit);
  const terms = queryTerms(query.query);
  if (terms.length === 0) {
    return { hits: [], hasMore: false };
  }
  const matches = conversationalMessages(events, threadId)
    .filter((message) => matchesAll(message.text, terms))
    .reverse();
  const hits = matches.slice(0, limit).map((message) => ({
    ...message,
    text: snippetText(message.text, query.query),
  }));
  return { hits, hasMore: matches.length > hits.length };
}

export function clampSearchLimit(value: number | undefined): number {
  return clampLimit(value, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
}

export function snippetText(text: string, query: string): string {
  if (text.length <= SNIPPET_MAX_CHARS) {
    return text;
  }
  const terms = queryTerms(query);
  const lower = text.toLowerCase();
  const found = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (found === undefined) {
    return `${text.slice(0, SNIPPET_MAX_CHARS)}…`;
  }
  const start = Math.max(0, found - Math.floor(SNIPPET_MAX_CHARS / 3));
  const end = Math.min(text.length, start + SNIPPET_MAX_CHARS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function conversationalMessages(events: SessionEvent[], threadId: string): ThreadHistoryMessage[] {
  const messages: ThreadHistoryMessage[] = [];
  for (const event of events) {
    if (event.conversational !== true || event.threadSeq === undefined) {
      continue;
    }
    const message = toMessage(event, threadId);
    if (message !== null) {
      messages.push(message);
    }
  }
  return messages;
}

function toMessage(event: SessionEvent, threadId: string): ThreadHistoryMessage | null {
  const threadSeq = event.threadSeq ?? 0;
  if (event.type === 'user') {
    const author = event.author?.displayName;
    return {
      threadId,
      threadSeq,
      role: 'user',
      ...(author ? { author } : {}),
      text: event.text,
    };
  }
  if (event.type === 'run.completed') {
    return { threadId, threadSeq, role: 'assistant', text: event.text ?? '' };
  }
  return null;
}

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function matchesAll(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

function clampHistoryLimit(value: number | undefined): number {
  return clampLimit(value, DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(Math.floor(value), max);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
