import { Injectable } from '@harnesys/brix';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';

export function addonSecretKey(orgId: string, addonId: string, key: string): string {
  return `addon:${orgId}:${addonId}:${key}`;
}

export function addonSecretKeyPrefix(orgId: string, addonId: string): string {
  return `addon:${orgId}:${addonId}:`;
}

export function addonSecretName(storageKey: string, orgId: string, addonId: string): string {
  const prefix = addonSecretKeyPrefix(orgId, addonId);
  return storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : '';
}

@Injectable()
export class AddonSecretService {
  constructor(private readonly secrets: SecretStorePort) {}

  async get(orgId: string, addonId: string, key: string): Promise<string | null> {
    return this.secrets.get(orgId, addonSecretKey(orgId, addonId, key));
  }

  async set(orgId: string, addonId: string, key: string, value: string): Promise<void> {
    await this.secrets.set(orgId, addonSecretKey(orgId, addonId, key), value);
  }

  async delete(orgId: string, addonId: string, key: string): Promise<void> {
    await this.secrets.delete(orgId, addonSecretKey(orgId, addonId, key));
  }

  async keys(orgId: string, addonId: string): Promise<string[]> {
    const prefix = addonSecretKeyPrefix(orgId, addonId);
    const all = await this.secrets.listKeys(orgId);
    return all
      .filter((storageKey) => storageKey.startsWith(prefix))
      .map((storageKey) => addonSecretName(storageKey, orgId, addonId))
      .filter((name) => name.length > 0)
      .sort();
  }
}
