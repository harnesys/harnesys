import { Injectable } from '@harnesys/brix';
import { ProviderError } from '../../domain/apps/errors.ts';
import { SecretScopePort, type SecretTarget } from '../../domain/apps/ports/secret-scope.port.ts';
import type { SecretReader } from '../../domain/apps/provider-module.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';

@Injectable()
export class ScopedSecretsAdapter extends SecretScopePort {
  constructor(private readonly store: SecretStorePort) {
    super();
  }

  reader(orgId: string, target: SecretTarget, allowed: readonly string[]): SecretReader {
    const allowedSet = new Set(allowed);
    const prefix = secretPrefix(target);
    return {
      get: (key) => {
        assertAllowed(key, allowedSet);
        return this.store.get(orgId, prefix + key);
      },
      require: async (key) => {
        assertAllowed(key, allowedSet);
        const value = await this.store.get(orgId, prefix + key);
        if (value === null) {
          throw new ProviderError('invalid_credentials');
        }
        return value;
      },
    };
  }

  async write(
    orgId: string,
    target: SecretTarget,
    allowed: readonly string[],
    secrets: Record<string, string>,
  ): Promise<void> {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(secrets)) {
      assertAllowed(key, allowedSet);
    }
    const prefix = secretPrefix(target);
    for (const [key, value] of Object.entries(secrets)) {
      await this.store.set(orgId, prefix + key, value);
    }
  }

  async remove(orgId: string, target: SecretTarget, keys: readonly string[]): Promise<void> {
    const prefix = secretPrefix(target);
    for (const key of keys) {
      await this.store.delete(orgId, prefix + key);
    }
  }

  async storedKeys(
    orgId: string,
    target: SecretTarget,
    allowed: readonly string[],
  ): Promise<string[]> {
    const prefix = secretPrefix(target);
    const keys = await this.store.listKeys(orgId);
    return keys
      .filter((key) => key.startsWith(prefix) && allowed.includes(key.slice(prefix.length)))
      .map((key) => key.slice(prefix.length))
      .sort();
  }
}

function secretPrefix(target: SecretTarget): string {
  return `${target.type}:${target.id}:`;
}

function assertAllowed(key: string, allowed: Set<string>): void {
  if (!allowed.has(key)) {
    throw new ProviderError('invalid_credentials');
  }
}
