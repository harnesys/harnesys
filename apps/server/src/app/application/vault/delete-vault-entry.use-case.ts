import { Injectable } from '@harnesys/brix';
import {
  VaultNotFoundException,
  VaultValidationException,
} from '../../domain/secret/secret.error.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { isValidVaultName, vaultStorageKey } from '../../domain/secret/vault-keys.ts';

export interface DeleteVaultEntryInput {
  orgId: string;
  name: string;
}

@Injectable()
export class DeleteVaultEntryUseCase {
  constructor(private readonly secrets: SecretStorePort) {}

  async execute(input: DeleteVaultEntryInput): Promise<void> {
    const name = input.name.trim();
    if (!isValidVaultName(name)) {
      throw new VaultValidationException('invalid vault entry name');
    }
    const keys = await this.secrets.listKeys(input.orgId);
    const secretKey = vaultStorageKey('secret', name);
    const varKey = vaultStorageKey('variable', name);
    let key: string | null = null;
    if (keys.includes(secretKey)) {
      key = secretKey;
    } else if (keys.includes(varKey)) {
      key = varKey;
    }
    if (!key) {
      throw new VaultNotFoundException(name);
    }
    await this.secrets.delete(input.orgId, key);
  }
}
