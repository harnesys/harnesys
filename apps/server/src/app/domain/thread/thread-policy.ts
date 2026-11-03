import { type ThreadPolicy, ThreadPolicySchema } from '@harnesys/contracts';

export const DEFAULT_CONTEXT_WINDOW = 6;
export type { ThreadPolicy };
export { ThreadPolicySchema };

export const EMPTY_THREAD_POLICY: ThreadPolicy = { version: 1 };

export function parseThreadPolicy(raw: string | null | undefined): ThreadPolicy {
  if (!raw) {
    return EMPTY_THREAD_POLICY;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = ThreadPolicySchema.safeParse(parsed);
    return result.success ? result.data : EMPTY_THREAD_POLICY;
  } catch {
    return EMPTY_THREAD_POLICY;
  }
}

export function contextWindowOf(policy: ThreadPolicy): number {
  return policy.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function allowsMentions(policy: ThreadPolicy): boolean {
  return policy.mentionGating !== true;
}
