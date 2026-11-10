export interface OwnerKey {
  orgId: string;
  addonId: string;
  version: string;
}

export interface Disposable {
  dispose(): void;
}

export function ownerKeyId(owner: OwnerKey): string {
  return `${owner.orgId}/${owner.addonId}@${owner.version}`;
}

export function ownerKeyEquals(a: OwnerKey, b: OwnerKey): boolean {
  return a.orgId === b.orgId && a.addonId === b.addonId && a.version === b.version;
}
