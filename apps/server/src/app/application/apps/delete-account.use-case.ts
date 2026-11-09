import { Injectable } from '@harnesys/brix';
import { accountSecretKey } from '../../domain/apps/account.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { requireAccount } from './app-lookup.ts';

export interface DeleteAccountRequest {
  orgId: string;
  accountId: string;
}

@Injectable()
export class DeleteAccountUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: DeleteAccountRequest): Promise<void> {
    const record = requireAccount(this.apps, request.orgId, request.accountId);
    for (const field of record.secretFields) {
      await this.secrets.delete(record.orgId, accountSecretKey(record.id, field));
    }
    this.apps.removeAccount(request.orgId, record.id);
  }
}
