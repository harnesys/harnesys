import { Injectable } from '@harnesys/brix';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import type { AccountHolderRef } from '../../../domain/apps/errors.ts';
import { AccountHolderPort } from '../../../domain/apps/ports/account-holder.port.ts';

@Injectable()
export class AccountHolderBridge {
  private unregister: (() => void) | null = null;

  constructor(
    private readonly holders: AccountHolderPort,
    private readonly bindings: BindingRepositoryPort,
  ) {}

  onModuleInit(): void {
    this.unregister = this.holders.register('addon', async (orgId, accountId) =>
      this.lookup(orgId, accountId),
    );
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  async lookup(orgId: string, accountId: string): Promise<AccountHolderRef[]> {
    return this.bindings.byAccount(orgId, accountId).map((binding) => ({
      holderType: 'addon',
      holderId: binding.addonId,
      label: binding.addonId,
    }));
  }
}
