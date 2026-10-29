import type { SecretStorePort } from './secret-store.port.ts';
import { legacyProviderSecretKey, parseVaultRef, vaultStorageKey } from './vault-keys.ts';

export async function resolveProviderApiKey(
  secrets: SecretStorePort,
  orgId: string,
  providerId: string,
  apiKeyColumn: string | null,
): Promise<string | undefined> {
  const ref = parseVaultRef(apiKeyColumn ?? '');
  if (ref?.kind === 'secret') {
    return (await secrets.get(orgId, vaultStorageKey('secret', ref.name))) ?? undefined;
  }
  const legacy = await secrets.get(orgId, legacyProviderSecretKey(providerId));
  if (legacy != null && legacy !== '') {
    return legacy;
  }
  if (apiKeyColumn && !parseVaultRef(apiKeyColumn)) {
    return apiKeyColumn;
  }
  return undefined;
}
