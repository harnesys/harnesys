import type { SessionEvent } from '../ports/session.ts';

export type MessageSourceKind = 'assistant' | 'user' | 'tool';

export interface MessageSource {
  runId?: string;
  seq?: number;
  threadSeq?: number;
  engSeq?: number;
  kind?: MessageSourceKind;
  toolCallId?: string;
}

export type SourcedMessage = Record<string, unknown> & { src?: MessageSource | null };

export function sourceOfEvent(event: SessionEvent): MessageSource {
  return {
    ...(event.runId !== undefined ? { runId: event.runId } : {}),
    ...(typeof event.seq === 'number' ? { seq: event.seq } : {}),
    ...(typeof event.threadSeq === 'number' ? { threadSeq: event.threadSeq } : {}),
  };
}

export function stampMessageSource(message: unknown, src: MessageSource | null): void {
  const target = asMessageObject(message);
  if (target) {
    target.src = src;
  }
}

export function messageSourceOf(message: unknown): MessageSource | null | undefined {
  return asMessageObject(message)?.src;
}

function asMessageObject(message: unknown): SourcedMessage | undefined {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return undefined;
  }
  return message as SourcedMessage;
}
