import { Injectable } from '@harnesys/brix';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  legacyProviderSecretKey,
  parseVaultRef,
  secretRef,
  slugVaultName,
  vaultStorageKey,
} from '../../domain/secret/vault-keys.ts';

@Injectable()
export class ProviderKeys {
  constructor(private readonly secrets: SecretStorePort) {}

  async hasSecret(
    orgId: string,
    providerId: string,
    apiKeyColumn: string | null,
  ): Promise<boolean> {
    const ref = parseVaultRef(apiKeyColumn ?? '');
    if (ref?.kind === 'secret') {
      const value = await this.secrets.get(orgId, vaultStorageKey('secret', ref.name));
      return value != null && value !== '';
    }
    const legacy = await this.secrets.get(orgId, legacyProviderSecretKey(providerId));
    return legacy != null && legacy !== '';
  }

  apiKeySecretName(apiKeyColumn: string | null): string | null {
    const ref = parseVaultRef(apiKeyColumn ?? '');
    return ref?.kind === 'secret' ? ref.name : null;
  }

  async resolveApiKey(
    orgId: string,
    providerId: string,
    apiKeyColumn: string | null | undefined,
  ): Promise<string | undefined> {
    const column = apiKeyColumn ?? null;
    const ref = parseVaultRef(column ?? '');
    if (ref?.kind === 'secret') {
      const value = await this.secrets.get(orgId, vaultStorageKey('secret', ref.name));
      if (value != null && value !== '') {
        return value;
      }
      return undefined;
    }
    const legacyKey = legacyProviderSecretKey(providerId);
    const legacy = await this.secrets.get(orgId, legacyKey);
    if (legacy != null && legacy !== '') {
      return legacy;
    }
    if (column && !parseVaultRef(column)) {
      return column;
    }
    return undefined;
  }

  async writeApiKey(
    orgId: string,
    providerId: string,
    value: string | null | undefined,
    options?: { secretName?: string | null; providerName?: string },
  ): Promise<string | null> {
    const legacyKey = legacyProviderSecretKey(providerId);
    if (value == null || value === '') {
      await this.secrets.delete(orgId, legacyKey);
      return null;
    }
    const preferred =
      options?.secretName?.trim() ||
      slugVaultName(options?.providerName ?? '', providerId.replace(/-/g, '').slice(0, 8));
    const name = await this.allocateSecretName(orgId, preferred);
    await this.secrets.set(orgId, vaultStorageKey('secret', name), value);
    await this.secrets.delete(orgId, legacyKey);
    return secretRef(name);
  }

  async migrateLegacyIfNeeded(
    orgId: string,
    providerId: string,
    providerName: string,
    apiKeyColumn: string | null,
  ): Promise<string | null> {
    if (parseVaultRef(apiKeyColumn ?? '')?.kind === 'secret') {
      return apiKeyColumn;
    }
    const legacyKey = legacyProviderSecretKey(providerId);
    const legacy = await this.secrets.get(orgId, legacyKey);
    if (legacy == null || legacy === '') {
      return apiKeyColumn;
    }
    return this.writeApiKey(orgId, providerId, legacy, { providerName });
  }

  private async allocateSecretName(orgId: string, preferred: string): Promise<string> {
    const keys = await this.secrets.listKeys(orgId);
    const taken = new Set(
      keys
        .map((key) => {
          const ref = parseVaultRef(key);
          return ref?.name;
        })
        .filter((name): name is string => Boolean(name)),
    );
    if (!taken.has(preferred)) {
      return preferred;
    }
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${preferred.slice(0, 60)}-${i}`;
      if (!taken.has(candidate)) {
        return candidate;
      }
    }
    return `${preferred.slice(0, 48)}-${Date.now().toString(36)}`;
  }
}
