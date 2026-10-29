let currentOrgId: string | null = null;

export function setCurrentOrgId(id: string | null): void {
  currentOrgId = id;
}

export function getActiveOrgId(): string | null {
  return currentOrgId;
}
