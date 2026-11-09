import { estimateMessageTokens } from './estimate.ts';
export interface CutPlan {
  coveredFrom: number;
  coveredUntil: number;
}

export function protectedWindowCount(messages: readonly unknown[], turns: number): number {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isUserTurnMessage(messages[i])) {
      continue;
    }
    seen += 1;
    if (seen === turns) {
      return messages.length - i;
    }
  }
  return messages.length;
}

function isUserTurnMessage(item: unknown): boolean {
  return item !== null && typeof item === 'object' && (item as { role?: unknown }).role === 'user';
}

export function isClosedBoundary(messages: readonly unknown[], index: number): boolean {
  const m = messages[index] as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') {
    return false;
  }
  if (m.role !== 'assistant') {
    return true;
  }
  const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
  if (calls.length === 0) {
    return true;
  }
  const ids = new Set(
    calls
      .map((c) =>
        String(
          (
            c as {
              id?: unknown;
            }
          ).id ?? '',
        ),
      )
      .filter((id) => id !== ''),
  );
  if (ids.size === 0) {
    return true;
  }
  for (let j = index + 1; j < messages.length; j++) {
    const n = messages[j] as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') {
      continue;
    }
    if (n.role === 'assistant') {
      break;
    }
    if (n.role === 'tool') {
      ids.delete(String(n.toolCallId ?? ''));
    }
  }
  return ids.size === 0;
}
export function planCut(
  messages: readonly unknown[],
  opts: {
    protectTokens: number;
    protectMessages?: number;
    afterIndex: number;
  },
): CutPlan | null {
  let limit = messages.length - 1;
  if ((opts.protectMessages ?? 0) > 0) {
    limit = Math.min(limit, messages.length - 1 - (opts.protectMessages ?? 0));
  }
  if (opts.protectTokens > 0) {
    let acc = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      acc += estimateMessageTokens(messages[i]);
      if (acc >= opts.protectTokens) {
        limit = i - 1;
        break;
      }
    }
  }
  for (let i = Math.min(limit, messages.length - 1); i > opts.afterIndex; i--) {
    if (isClosedBoundary(messages, i)) {
      return { coveredFrom: opts.afterIndex + 1, coveredUntil: i };
    }
  }
  return null;
}
