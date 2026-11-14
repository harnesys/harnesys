let currentOrgId: string | null = null;
const listeners = new Set<() => void>();

export function setCurrentOrgId(id: string | null): void {
  if (currentOrgId === id) {
    return;
  }
  currentOrgId = id;
  for (const listener of listeners) {
    listener();
  }
}

export function getActiveOrgId(): string | null {
  return currentOrgId;
}

export function subscribeActiveOrg(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
