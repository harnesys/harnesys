import type { MessageQuote } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import { requestMessageJump } from './message-jump';
import { useReplyTargetStore } from './reply-target.store';

export const QUOTE_TEXT_MAX = 400;

type UserEvent = SessionEvent & { type: 'user' };

export function quoteOfEvent(event: UserEvent): MessageQuote | undefined {
  const threadSeq = event.threadSeq;
  if (threadSeq === undefined || threadSeq <= 0) {
    return undefined;
  }
  const text = quoteTextOf(event);
  if (text.length === 0) {
    return undefined;
  }
  return {
    threadSeq,
    author: (event.author?.displayName ?? 'You').slice(0, 120),
    text,
  };
}

export function quoteTextOf(event: UserEvent): string {
  const text = (event.text ?? '').trim();
  if (text.length > 0) {
    return truncate(text);
  }
  const names = event.attachments?.map((item) => item.name).filter((name) => name.length > 0) ?? [];
  return names.length > 0 ? truncate(names.map((name) => `[${name}]`).join(' ')) : '';
}

function truncate(text: string): string {
  return text.length <= QUOTE_TEXT_MAX ? text : `${text.slice(0, QUOTE_TEXT_MAX - 1)}…`;
}

export function quoteOfRunAnswer(
  lastThreadSeq: number | null,
  author: string | undefined,
  text: string,
): MessageQuote | undefined {
  const body = text.trim();
  if (lastThreadSeq === null || lastThreadSeq <= 0 || body.length === 0) {
    return undefined;
  }
  return {
    threadSeq: lastThreadSeq,
    author: (author ?? 'Agent').slice(0, 120),
    text: truncate(body),
  };
}

export function replyHandlerOf(
  threadId: string | undefined,
  quote: MessageQuote | undefined,
): (() => void) | undefined {
  if (!threadId || !quote) {
    return undefined;
  }
  return () => useReplyTargetStore.getState().set(threadId, quote);
}

export function jumpHandlerOf(
  threadId: string | undefined,
  quote: MessageQuote | undefined,
): (() => void) | undefined {
  if (!threadId || !quote) {
    return undefined;
  }
  return () => requestMessageJump(threadId, quote.threadSeq);
}
