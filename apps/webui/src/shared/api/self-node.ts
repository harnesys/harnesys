const projectNodeCache = new Map<string, string>();
let selfNodeCache: string | null = null;

export function rememberProjectNode(projectId: string, nodeId: string): void {
  projectNodeCache.set(projectId, nodeId);
}

export function rememberSelfNode(nodeId: string): void {
  selfNodeCache = nodeId;
}

export function projectNodeCached(projectId: string): string | null {
  return projectNodeCache.get(projectId) ?? null;
}

export function selfNodeCached(): string | null {
  return selfNodeCache;
}

export function isRemoteProjectCached(projectId: string): boolean {
  if (selfNodeCache === null) {
    return false;
  }
  const node = projectNodeCache.get(projectId);
  return node !== undefined && node !== selfNodeCache;
}
