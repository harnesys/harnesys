import {
  type ThreadContextFile,
  type ThreadHistoryMode,
  type ThreadKind,
  type ThreadPolicy,
  ThreadPolicySchema,
  type ThreadResponderMode,
} from '@harnesys/contracts';

export type { ThreadContextFile, ThreadHistoryMode, ThreadPolicy, ThreadResponderMode };
export { ThreadPolicySchema };

export const EMPTY_THREAD_POLICY: ThreadPolicy = { version: 2 };

export const DEFAULT_HISTORY_LAST = 10;

export const MAX_CONTEXT_FILES = 20;

/**
 * Files injected into the system prompt of every run when the thread has not
 * chosen its own list. `AGENTS.md` is the project convention, so a fresh thread
 * inherits it without any setup.
 */
export const DEFAULT_CONTEXT_FILES: readonly ThreadContextFile[] = [
  { path: 'AGENTS.md', enabled: true },
];

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

export interface NormalizedContextFiles {
  entries: ThreadContextFile[];
  /** First entry that could not be normalized, when the whole list must be rejected. */
  invalid?: { path: string; reason: string };
}

/**
 * Context files of a thread, defaulted when the policy never picked any.
 * An explicit empty array stays empty: it is how a thread opts out of
 * injection and out of future default changes.
 */
export function contextFilesOf(policy: ThreadPolicy): readonly ThreadContextFile[] {
  return policy.contextFiles ?? DEFAULT_CONTEXT_FILES;
}

/**
 * Canonical form of a context file path: forward slashes, no surrounding or
 * trailing slash. Returns undefined for paths that can never be resolved
 * inside the run root.
 */
export function normalizeContextFilePath(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) {
    return undefined;
  }
  const segments = trimmed.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length === 0) {
    return undefined;
  }
  if (segments.includes('..')) {
    return undefined;
  }
  return segments.join('/');
}

/**
 * Normalizes a user-supplied list before it is persisted. The result is
 * rejected as a whole when any entry is unusable: silently dropping a path the
 * user typed would leave them believing a file is injected when it is not.
 */
export function normalizeContextFiles(raw: readonly ThreadContextFile[]): NormalizedContextFiles {
  const entries: ThreadContextFile[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const path = normalizeContextFilePath(item.path);
    if (path === undefined) {
      return {
        entries: [],
        invalid: { path: item.path, reason: 'must be a relative path inside the run root' },
      };
    }
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    entries.push({ path, enabled: item.enabled });
    if (entries.length > MAX_CONTEXT_FILES) {
      return {
        entries: [],
        invalid: { path: item.path, reason: `at most ${MAX_CONTEXT_FILES} context files` },
      };
    }
  }
  return { entries };
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
