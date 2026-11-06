import type { AddonSecrets } from 'harnesys/integration';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';

export function addonSecretPrefix(integrationId: string): string {
  return `integration:${integrationId}:`;
}

export function createAddonSecrets(
  store: SecretStorePort,
  orgId: string,
  integrationId: string,
): AddonSecrets {
  const prefix = addonSecretPrefix(integrationId);
  return {
    get: async (key: string) => await store.get(orgId, prefix + key),
    set: async (key: string, value: string) => {
      await store.set(orgId, prefix + key, value);
    },
    delete: async (key: string) => {
      await store.delete(orgId, prefix + key);
    },
    keys: async () =>
      (await store.listKeys(orgId))
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
  };
}
