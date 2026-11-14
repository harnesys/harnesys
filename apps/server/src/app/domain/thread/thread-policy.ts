import {
  type ThreadHistoryMode,
  type ThreadKind,
  type ThreadPolicy,
  ThreadPolicySchema,
  type ThreadResponderMode,
} from '@harnesys/contracts';

export type { ThreadHistoryMode, ThreadPolicy, ThreadResponderMode };
export { ThreadPolicySchema };

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

export function allowsMentions(policy: ThreadPolicy): boolean {
  return policy.mentionGating !== true;
}

/**
 * Unified responder mode for any thread kind: 'auto' lets the pinned agent
 * answer messages nobody addressed, 'mention' reacts only to addressed
 * agents. Explicit policy wins; the kind default is 'mention' for group
 * threads and 'auto' everywhere else. Existing rows are backfilled to an
 * explicit value by migration, so the kind default only affects new threads.
 */
export function responderModeOf(policy: ThreadPolicy, kind: ThreadKind): ThreadResponderMode {
  return policy.responderMode ?? (kind === 'group' ? 'mention' : 'auto');
}
