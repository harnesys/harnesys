import { Injectable } from '@harnesys/brix';
import type { VaultEntry, VaultEntryKind } from '@harnesys/contracts';
import {
  VaultConflictException,
  VaultValidationException,
} from '../../domain/secret/secret.error.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { isValidVaultName, vaultStorageKey } from '../../domain/secret/vault-keys.ts';

export interface PutVaultEntryInput {
  orgId: string;
  name: string;
  kind: VaultEntryKind;
  value: string;
}

@Injectable()
export class PutVaultEntryUseCase {
  constructor(private readonly secrets: SecretStorePort) {}

  async execute(input: PutVaultEntryInput): Promise<VaultEntry> {
    const name = input.name.trim();
    if (!isValidVaultName(name)) {
      throw new VaultValidationException(
        'name must be 1-64 chars: start with a letter, then alnum, _ or -',
      );
    }
    const value = input.value;
    if (!value) {
      throw new VaultValidationException('value is required');
    }
    const keys = await this.secrets.listKeys(input.orgId);
    const otherKind = input.kind === 'secret' ? 'variable' : 'secret';
    const otherKey = vaultStorageKey(otherKind, name);
    if (keys.includes(otherKey)) {
      throw new VaultConflictException(
        `name "${name}" already used as ${otherKind}; names are unique across secrets and variables`,
      );
    }
    const key = vaultStorageKey(input.kind, name);
    await this.secrets.set(input.orgId, key, value);
    const entry: VaultEntry = {
      name,
      kind: input.kind,
    };
    if (input.kind === 'variable') {
      entry.value = value;
    }
    return entry;
  }
}
