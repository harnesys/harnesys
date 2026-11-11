import { Injectable } from '@harnesys/brix';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import type { BoundAccountRef } from '../services/sinks.ts';
import { AddonSecrets, BindingsReader } from '../services/sinks.ts';
import { AddonSecretService } from '../storage/addon-secret.service.ts';

@Injectable()
export class AddonSecretsAdapter extends AddonSecrets {
  constructor(private readonly secrets: AddonSecretService) {
    super();
  }

  override async get(orgId: string, addonId: string, key: string): Promise<string | null> {
    return await this.secrets.get(orgId, addonId, key);
  }

  override async set(orgId: string, addonId: string, key: string, value: string): Promise<void> {
    await this.secrets.set(orgId, addonId, key, value);
  }

  override async delete(orgId: string, addonId: string, key: string): Promise<void> {
    await this.secrets.delete(orgId, addonId, key);
  }
}

@Injectable()
export class BindingsReaderAdapter extends BindingsReader {
  constructor(private readonly bindings: BindingRepositoryPort) {
    super();
  }

  override accountsFor(orgId: string, addonId: string, connectionId: string): BoundAccountRef[] {
    return this.bindings
      .accountsFor(orgId, addonId, connectionId)
      .map((row) => ({ accountId: row.accountId }));
  }
}
