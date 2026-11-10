import { Injectable } from '@harnesys/brix';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonTriggerInstanceStore, orgIdOfInstanceKey } from './addon-trigger-instance.store.ts';
import { listOrgIds } from './list-org-ids.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonTriggerInstanceRepositoryAdapter extends TriggerInstanceRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override list(orgId: string, addonId?: string): TriggerInstanceRow[] {
    return this.withStore(orgId, (store) => store.list(orgId, addonId));
  }

  override find(orgId: string, instanceId: string): TriggerInstanceRow | null {
    return this.withStore(orgId, (store) => store.find(orgId, instanceId));
  }

  override create(row: TriggerInstanceRow): TriggerInstanceRow {
    return this.withStore(row.orgId, (store) => store.create(row));
  }

  override update(orgId: string, instanceId: string, patch: TriggerInstancePatch): void {
    this.withStore(orgId, (store) => store.update(orgId, instanceId, patch));
  }

  override remove(orgId: string, instanceId: string): void {
    this.withStore(orgId, (store) => store.remove(orgId, instanceId));
  }

  override removeAddon(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.removeAddon(orgId, addonId));
  }

  override recordFire(instanceId: string, runKey: string, firedAt: number): boolean {
    const orgId = orgIdOfInstanceKey(instanceId);
    if (!orgId) {
      return false;
    }
    return this.withStore(orgId, (store) => store.recordFire(instanceId, runKey, firedAt));
  }

  override cleanupFires(olderThan: number): void {
    for (const orgId of listOrgIds(this.layout)) {
      this.withStore(orgId, (store) => store.cleanupFires(olderThan));
    }
  }

  private withStore<T>(orgId: string, fn: (store: AddonTriggerInstanceStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonTriggerInstanceStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
