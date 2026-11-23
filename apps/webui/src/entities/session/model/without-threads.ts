export function withoutThreads<T>(map: Record<string, T>, threadIds: string[]): Record<string, T> {
  const next = { ...map };
  for (const id of threadIds) {
    delete next[id];
  }
  return next;
}
