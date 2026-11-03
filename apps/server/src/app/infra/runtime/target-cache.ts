export type TargetCache = Map<string, { agentId: string; pathsAllow: string[]; cwd: string }>;

export function targetCacheKey(threadId: string, agentId: string): string {
  return `${threadId}:${agentId}`;
}

export function cachedTargetOf(
  cache: TargetCache,
  threadId: string,
): { agentId: string; pathsAllow: string[]; cwd: string } | undefined {
  const prefix = `${threadId}:`;
  for (const [key, value] of cache) {
    if (key.startsWith(prefix)) {
      return value;
    }
  }
  return undefined;
}
