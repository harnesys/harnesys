import { DEFAULT_CONTEXT_WINDOW, type ThreadHistoryMode, type ThreadKind, type ThreadPolicy, ThreadPolicySchema } from '@harnesys/contracts';

export type { ThreadHistoryMode, ThreadPolicy };
export { DEFAULT_CONTEXT_WINDOW, ThreadPolicySchema };

export const EMPTY_THREAD_POLICY: ThreadPolicy = { version: 2 };

export const DEFAULT_HISTORY_LAST = 10;

export const DEFAULT_HISTORY_MODE_BY_KIND: Record<ThreadKind, ThreadHistoryMode> = {
  chat: 'full',
  group: 'last',
  schedule: 'none',
  webhook: 'none',
  issue: 'full',
};

export function parseThreadPolicy(raw: string | null | undefined): ThreadPolicy {
  if (!raw) {
    return EMPTY_THREAD_POLICY;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = ThreadPolicySchema.safeParse(parsed);
    if (!result.success) {
      return EMPTY_THREAD_POLICY;
    }
    return result.data.version === 2 ? result.data : { ...result.data, version: 2 };
  } catch {
    return EMPTY_THREAD_POLICY;
  }
}

export function historyModeOf(policy: ThreadPolicy, kind: ThreadKind): ThreadHistoryMode {
  return policy.historyMode ?? DEFAULT_HISTORY_MODE_BY_KIND[kind];
}

export function historyLastOf(policy: ThreadPolicy): number {
  return policy.historyLast ?? DEFAULT_HISTORY_LAST;
}

export function contextWindowOf(policy: ThreadPolicy): number {
  return policy.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function allowsMentions(policy: ThreadPolicy): boolean {
  return policy.mentionGating !== true;
}
