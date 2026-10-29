import { Injectable } from '@harnesys/brix';
import type { VaultEntry, VaultListResponse } from '@harnesys/contracts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { parseVaultStorageKey } from '../../domain/secret/vault-keys.ts';

@Injectable()
export class ListVaultEntriesUseCase {
  constructor(private readonly secrets: SecretStorePort) {}

  async execute(orgId: string): Promise<VaultListResponse> {
    const keys = await this.secrets.listKeys(orgId);
    const items: VaultEntry[] = [];
    for (const key of keys) {
      const parsed = parseVaultStorageKey(key);
      if (!parsed) {
        continue;
      }
      const entry: VaultEntry = {
        name: parsed.name,
        kind: parsed.kind,
      };
      if (parsed.kind === 'variable') {
        const value = await this.secrets.get(orgId, key);
        if (value != null) {
          entry.value = value;
        }
      }
      items.push(entry);
    }
    items.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
    return { items };
  }
}
