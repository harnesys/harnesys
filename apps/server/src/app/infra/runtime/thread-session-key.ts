export function threadSessionKey(threadId: string, agentId?: string): string {
  return agentId === undefined ? `${threadId}:` : `${threadId}:${agentId}`;
}

export function threadSessionPrefix(threadId: string): string {
  return `${threadId}:`;
}
