import { Injectable } from '@harnesys/brix';
import type { AddonTransportBindingRow } from '../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../domain/addons/ports/transport-binding-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonTransportBindingStore } from './addon-transport-binding.store.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonTransportBindingRepositoryAdapter extends AddonTransportBindingRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override find(
    orgId: string,
    addonId: string,
    provider: string,
    externalChatId: string,
  ): AddonTransportBindingRow | null {
    return this.withStore(orgId, (store) => store.find(orgId, addonId, provider, externalChatId));
  }

  override findByThread(orgId: string, threadId: string): AddonTransportBindingRow[] {
    return this.withStore(orgId, (store) => store.findByThread(orgId, threadId));
  }

  override listByAddon(orgId: string, addonId: string): AddonTransportBindingRow[] {
    return this.withStore(orgId, (store) => store.listByAddon(orgId, addonId));
  }

  override add(row: AddonTransportBindingRow): void {
    this.withStore(row.orgId, (store) => store.add(row));
  }

  override remove(orgId: string, addonId: string, provider: string, externalChatId: string): void {
    this.withStore(orgId, (store) => store.remove(orgId, addonId, provider, externalChatId));
  }

  override removeAddon(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.removeAddon(orgId, addonId));
  }

  private withStore<T>(orgId: string, fn: (store: AddonTransportBindingStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonTransportBindingStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
