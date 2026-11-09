import { createHash } from 'node:crypto';

export type AccountStatus = 'connected' | 'expired' | 'error' | 'pending';

export interface AccountRecord {
  id: string;
  orgId: string;
  appId: string | null;
  kind: string;
  externalAccountId: string;
  label: string;
  status: AccountStatus;
  scopes: string[];
  scopeKey: string;
  secretRef: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountUpdatePatch {
  appId?: string | null;
  label?: string;
  status?: AccountStatus;
  scopes?: string[];
  scopeKey?: string;
  secretRef?: string;
  lastError?: string | null;
  updatedAt?: string;
}

export interface AccountKey {
  kind: string;
  externalAccountId: string;
  scopeKey: string;
}

export function normalizeAccountScopes(scopes: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const scope of scopes) {
    const normalized = scope.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique].sort();
}

export function scopeKeyOf(scopes: readonly string[]): string {
  return createHash('sha256').update(normalizeAccountScopes(scopes).join('\n')).digest('hex');
}

export function accountSecretRef(accountId: string): string {
  return `account:${accountId}`;
}
