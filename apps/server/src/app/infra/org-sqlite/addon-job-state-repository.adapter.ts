import { Injectable } from '@harnesys/brix';
import type { JobStateRow } from '../../domain/addons/ports/job-state-repository.port.ts';
import { JobStateRepositoryPort } from '../../domain/addons/ports/job-state-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonJobStateStore } from './addon-job-state.store.ts';
import { listOrgIds } from './list-org-ids.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonJobStateRepositoryAdapter extends JobStateRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override list(orgId: string, addonId?: string): JobStateRow[] {
    return this.withStore(orgId, (store) => store.list(orgId, addonId));
  }

  override listAll(): JobStateRow[] {
    const rows: JobStateRow[] = [];
    for (const orgId of listOrgIds(this.layout)) {
      rows.push(...this.withStore(orgId, (store) => store.listAll()));
    }
    return rows;
  }

  override find(orgId: string, addonId: string, jobId: string): JobStateRow | null {
    return this.withStore(orgId, (store) => store.find(orgId, addonId, jobId));
  }

  override upsert(row: JobStateRow): void {
    this.withStore(row.orgId, (store) => store.upsert(row));
  }

  override recordRun(
    orgId: string,
    addonId: string,
    jobId: string,
    ranAt: number,
    status: string | null,
  ): void {
    this.withStore(orgId, (store) => store.recordRun(orgId, addonId, jobId, ranAt, status));
  }

  override setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    this.withStore(orgId, (store) => store.setEnabled(orgId, addonId, jobId, enabled));
  }

  override removeAddon(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.removeAddon(orgId, addonId));
  }

  private withStore<T>(orgId: string, fn: (store: AddonJobStateStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonJobStateStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
