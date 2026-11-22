import type { MessageSource } from '../message-source.ts';

export type CoveredKind = 'assistant' | 'user' | 'tool';

export interface CoveredBoundary {
  engSeq?: number;
  runId?: string;
  seq?: number;
  kind: CoveredKind;
  toolCallId?: string;
}

function kindOfMessage(message: Record<string, unknown>): CoveredKind | undefined {
  const role = message.role;
  if (role === 'tool') {
    return 'tool';
  }
  if (role === 'user') {
    return 'user';
  }
  if (role === 'assistant') {
    return 'assistant';
  }
  return undefined;
}

export function resolveCoveredBoundary(
  messages: readonly unknown[],
  coveredUntil: number,
): CoveredBoundary | null {
  for (let index = Math.min(coveredUntil, messages.length - 1); index >= 0; index -= 1) {
    const message = messages[index] as Record<string, unknown> | null | undefined;
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      continue;
    }
    const kind = kindOfMessage(message);
    if (kind === undefined) {
      continue;
    }
    const src = message.src as MessageSource | null | undefined;
    if (!src || typeof src !== 'object') {
      continue;
    }
    const toolCallId =
      kind === 'tool' && typeof message.toolCallId === 'string' && message.toolCallId
        ? message.toolCallId
        : undefined;
    if (kind === 'tool' && toolCallId === undefined) {
      continue;
    }
    const engSeq =
      typeof src.engSeq === 'number' && Number.isFinite(src.engSeq) ? src.engSeq : undefined;
    if (engSeq !== undefined) {
      return {
        kind,
        engSeq,
        ...(toolCallId !== undefined ? { toolCallId } : {}),
      };
    }
    const runId = typeof src.runId === 'string' && src.runId ? src.runId : undefined;
    const seq = typeof src.seq === 'number' && Number.isFinite(src.seq) ? src.seq : undefined;
    if (runId === undefined || seq === undefined) {
      continue;
    }
    return {
      kind,
      runId,
      seq,
      ...(toolCallId !== undefined ? { toolCallId } : {}),
    };
  }
  return null;
}
