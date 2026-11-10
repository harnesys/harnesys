import { Injectable } from '@harnesys/brix';
import type { AddonBindingRow } from '../../domain/addons/ports/binding-repository.port.ts';
import { BindingRepositoryPort } from '../../domain/addons/ports/binding-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonBindingStore } from './addon-binding.store.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonBindingRepositoryAdapter extends BindingRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override list(orgId: string, addonId?: string): AddonBindingRow[] {
    return this.withStore(orgId, (store) => store.list(orgId, addonId));
  }

  override accountsFor(orgId: string, addonId: string, connectionId: string): AddonBindingRow[] {
    return this.withStore(orgId, (store) => store.accountsFor(orgId, addonId, connectionId));
  }

  override byAccount(orgId: string, accountId: string): AddonBindingRow[] {
    return this.withStore(orgId, (store) => store.byAccount(orgId, accountId));
  }

  override add(row: AddonBindingRow): void {
    this.withStore(row.orgId, (store) => store.add(row));
  }

  override remove(orgId: string, addonId: string, connectionId: string, accountId: string): void {
    this.withStore(orgId, (store) => store.remove(orgId, addonId, connectionId, accountId));
  }

  override setBindings(
    orgId: string,
    addonId: string,
    connectionId: string,
    accountIds: readonly string[],
  ): void {
    this.withStore(orgId, (store) => store.setBindings(orgId, addonId, connectionId, accountIds));
  }

  override removeAddon(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.removeAddon(orgId, addonId));
  }

  private withStore<T>(orgId: string, fn: (store: AddonBindingStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonBindingStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
