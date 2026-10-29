import type { VaultEntryKind } from '@harnesys/contracts';

export const VAULT_SECRET_PREFIX = 'secret:';
export const VAULT_VAR_PREFIX = 'var:';
export const LEGACY_PROVIDER_SECRET_PREFIX = 'llm_provider:';
export const SYSTEM_CLOUD_PREFIX = 'cloud:';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function isValidVaultName(name: string): boolean {
  return NAME_RE.test(name);
}

export function vaultStorageKey(kind: VaultEntryKind, name: string): string {
  return kind === 'secret' ? `${VAULT_SECRET_PREFIX}${name}` : `${VAULT_VAR_PREFIX}${name}`;
}

export function parseVaultStorageKey(key: string): { kind: VaultEntryKind; name: string } | null {
  if (key.startsWith(VAULT_SECRET_PREFIX)) {
    const name = key.slice(VAULT_SECRET_PREFIX.length);
    return name ? { kind: 'secret', name } : null;
  }
  if (key.startsWith(VAULT_VAR_PREFIX)) {
    const name = key.slice(VAULT_VAR_PREFIX.length);
    return name ? { kind: 'variable', name } : null;
  }
  return null;
}

export function parseVaultRef(value: string): { kind: VaultEntryKind; name: string } | null {
  return parseVaultStorageKey(value.trim());
}

export function isSystemSecretKey(key: string): boolean {
  return key.startsWith(SYSTEM_CLOUD_PREFIX) || key.startsWith(LEGACY_PROVIDER_SECRET_PREFIX);
}

export function legacyProviderSecretKey(providerId: string): string {
  return `${LEGACY_PROVIDER_SECRET_PREFIX}${providerId}`;
}

export function secretRef(name: string): string {
  return `${VAULT_SECRET_PREFIX}${name}`;
}

export function slugVaultName(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (cleaned && /^[A-Za-z]/.test(cleaned)) {
    return cleaned;
  }
  const withPrefix = `p-${cleaned || fallback}`.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 64);
  return withPrefix || `p-${fallback.slice(0, 60)}`;
}
