import { Injectable } from '@harnesys/brix';
import type {
  OrgAddonHealth,
  OrgAddonRow,
} from '../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { listOrgIds } from './list-org-ids.ts';
import { OrgAddonStore } from './org-addon.store.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class OrgAddonRepositoryAdapter extends OrgAddonRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override list(orgId: string): OrgAddonRow[] {
    return this.withStore(orgId, (store) => store.list(orgId));
  }

  override listAll(): OrgAddonRow[] {
    const rows: OrgAddonRow[] = [];
    for (const orgId of listOrgIds(this.layout)) {
      rows.push(...this.withStore(orgId, (store) => store.listAll()));
    }
    return rows;
  }

  override find(orgId: string, addonId: string): OrgAddonRow | null {
    return this.withStore(orgId, (store) => store.find(orgId, addonId));
  }

  override upsert(row: OrgAddonRow): void {
    this.withStore(row.orgId, (store) => store.upsert(row));
  }

  override setEnabled(orgId: string, addonId: string, enabled: boolean): void {
    this.withStore(orgId, (store) => store.setEnabled(orgId, addonId, enabled));
  }

  override updateGrants(
    orgId: string,
    addonId: string,
    grantsJson: string,
    grantsDigest: string,
  ): void {
    this.withStore(orgId, (store) => store.updateGrants(orgId, addonId, grantsJson, grantsDigest));
  }

  override updateConfig(orgId: string, addonId: string, configJson: string): void {
    this.withStore(orgId, (store) => store.updateConfig(orgId, addonId, configJson));
  }

  override updateHealth(
    orgId: string,
    addonId: string,
    health: OrgAddonHealth,
    lastError?: string | null,
  ): void {
    this.withStore(orgId, (store) => store.updateHealth(orgId, addonId, health, lastError));
  }

  override remove(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.remove(orgId, addonId));
  }

  private withStore<T>(orgId: string, fn: (store: OrgAddonStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new OrgAddonStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
