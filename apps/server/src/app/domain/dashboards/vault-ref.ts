export interface VaultRef {
  name: string;
  token: string;
}

export const VAULT_REF_PATTERN = /\{\{vault:([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g;

export const VAULT_REF_REDACTED = '{{vault:***}}';

export function collectVaultRefs(value: string): VaultRef[] {
  const refs: VaultRef[] = [];
  for (const match of value.matchAll(VAULT_REF_PATTERN)) {
    const name = match[1];
    if (name) {
      refs.push({ name, token: match[0] });
    }
  }
  return refs;
}

export function redactVaultRefs(value: string): string {
  return value.replaceAll(VAULT_REF_PATTERN, VAULT_REF_REDACTED);
}

export function applyVaultRefs(
  value: string,
  resolve: (name: string) => string | null,
): string | null {
  const refs = collectVaultRefs(value);
  if (refs.length === 0) {
    return value;
  }
  let out = value;
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.name)) {
      continue;
    }
    seen.add(ref.name);
    const resolved = resolve(ref.name);
    if (resolved === null) {
      return null;
    }
    out = out.replaceAll(ref.token, resolved);
  }
  return out;
}
