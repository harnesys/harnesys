import type { OwnerKey } from '../../domain/addons/owner.ts';
import type { AddonRescanResult } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import {
  type AddonInstallRequest,
  type AddonLockFile,
  AddonPackageCatalogPort,
  type InstalledAddonPackage,
} from '../../domain/addons/ports/addon-package-catalog.port.ts';
import {
  type AddonBindingRow,
  BindingRepositoryPort,
} from '../../domain/addons/ports/binding-repository.port.ts';
import {
  type ContributionChangeHandler,
  type ContributionRecord,
  ContributionRegistryPort,
} from '../../domain/addons/ports/contribution-registry.port.ts';
import {
  JobStateRepositoryPort,
  type JobStateRow,
} from '../../domain/addons/ports/job-state-repository.port.ts';
import type {
  OrgAddonHealth,
  OrgAddonRow,
} from '../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import {
  type TriggerInstancePatch,
  TriggerInstanceRepositoryPort,
  type TriggerInstanceRow,
} from '../../domain/addons/ports/trigger-instance-repository.port.ts';

export {
  FakeAccounts,
  FakeAddonData,
  FakeAudit,
  FakeClock,
  FakeDispatch,
  FakeEvents,
  FakeMetrics,
  FakePolicy,
  FakeRpc,
  FakeSecrets,
  FakeSupervisor,
  NoopCalls,
  NullLogger,
  type TestManifest,
  testManifest,
} from './addons.fakes.host.ts';

export class InMemoryOrgAddons extends OrgAddonRepositoryPort {
  rows = new Map<string, OrgAddonRow>();
  list(orgId: string): OrgAddonRow[] {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }
  listAll(): OrgAddonRow[] {
    return [...this.rows.values()];
  }
  find(orgId: string, addonId: string): OrgAddonRow | null {
    return this.rows.get(`${orgId}/${addonId}`) ?? null;
  }
  upsert(row: OrgAddonRow): void {
    this.rows.set(`${row.orgId}/${row.addonId}`, { ...row });
  }
  setEnabled(orgId: string, addonId: string, enabled: boolean): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}`, { ...row, enabled });
    }
  }
  updateGrants(orgId: string, addonId: string, grantsJson: string, grantsDigest: string): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}`, { ...row, grantsJson, grantsDigest });
    }
  }
  updateConfig(orgId: string, addonId: string, configJson: string): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}`, { ...row, configJson });
    }
  }
  updateHealth(
    orgId: string,
    addonId: string,
    health: OrgAddonHealth,
    lastError?: string | null,
  ): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}`, { ...row, health, lastError: lastError ?? null });
    }
  }
  remove(orgId: string, addonId: string): void {
    this.rows.delete(`${orgId}/${addonId}`);
  }
}

export class InMemoryCatalog extends AddonPackageCatalogPort {
  packages = new Map<string, InstalledAddonPackage>();
  lock: AddonLockFile = { entries: [] };
  installed: AddonInstallRequest[] = [];
  removed: string[] = [];
  listInstalled(): InstalledAddonPackage[] {
    return [...this.packages.values()];
  }
  rescanHomeDir(): AddonRescanResult {
    return { added: [] };
  }
  find(id: string, version?: string): InstalledAddonPackage | undefined {
    const all = [...this.packages.values()].filter((pkg) => pkg.id === id);
    if (version) {
      return all.find((pkg) => pkg.version === version);
    }
    return all.sort((a, b) => b.installedAt.localeCompare(a.installedAt))[0];
  }
  readLock(): AddonLockFile {
    return { entries: [...this.lock.entries] };
  }
  writeLock(lock: AddonLockFile): void {
    this.lock = { entries: [...lock.entries] };
  }
  removePackage(id: string, version: string): void {
    this.packages.delete(`${id}@${version}`);
    this.removed.push(`${id}@${version}`);
  }
  install(request: AddonInstallRequest): InstalledAddonPackage {
    const pkg: InstalledAddonPackage = {
      id: request.manifest.id,
      version: request.manifest.version,
      digest: request.digest,
      source: request.source,
      trust: request.trust,
      root: request.stagingRef,
      manifest: request.manifest,
      installedAt: new Date().toISOString(),
    };
    this.packages.set(`${pkg.id}@${pkg.version}`, pkg);
    this.installed.push(request);
    return pkg;
  }
}

export class FakeRegistry extends ContributionRegistryPort {
  events: string[] = [];
  failSwap = false;
  contributionsByOrg = new Map<string, ContributionRecord[]>();
  private handlers = new Map<string, Set<ContributionChangeHandler>>();
  activate(owner: OwnerKey): void {
    this.events.push(`activate:${owner.orgId}/${owner.addonId}@${owner.version}`);
  }
  deactivate(owner: OwnerKey): void {
    this.events.push(`deactivate:${owner.orgId}/${owner.addonId}@${owner.version}`);
  }
  swap(oldOwner: OwnerKey, newOwner: OwnerKey): void {
    if (this.failSwap) {
      throw new Error('swap failed');
    }
    this.events.push(`swap:${oldOwner.version}->${newOwner.version}`);
  }
  contributions(orgId: string, family: string): readonly ContributionRecord[] {
    return (this.contributionsByOrg.get(orgId) ?? []).filter((entry) => entry.family === family);
  }
  onChange(orgId: string, family: string, handler: ContributionChangeHandler): () => void {
    const key = `${orgId}/${family}`;
    const set = this.handlers.get(key) ?? new Set();
    set.add(handler);
    this.handlers.set(key, set);
    return () => set.delete(handler);
  }
}

export class InMemoryTriggers extends TriggerInstanceRepositoryPort {
  rows = new Map<string, TriggerInstanceRow>();
  fires = new Map<string, number>();
  ttlMs = 7 * 24 * 60 * 60 * 1000;
  list(orgId: string, addonId?: string): TriggerInstanceRow[] {
    return [...this.rows.values()].filter(
      (row) => row.orgId === orgId && (addonId === undefined || row.addonId === addonId),
    );
  }
  find(orgId: string, instanceId: string): TriggerInstanceRow | null {
    return this.rows.get(`${orgId}/${instanceId}`) ?? null;
  }
  create(row: TriggerInstanceRow): TriggerInstanceRow {
    this.rows.set(`${row.orgId}/${row.id}`, { ...row });
    return { ...row };
  }
  update(orgId: string, instanceId: string, patch: TriggerInstancePatch): void {
    const row = this.rows.get(`${orgId}/${instanceId}`);
    if (row) {
      this.rows.set(`${orgId}/${instanceId}`, { ...row, ...patch, updatedAt: 'patched' });
    }
  }
  remove(orgId: string, instanceId: string): void {
    this.rows.delete(`${orgId}/${instanceId}`);
  }
  removeAddon(orgId: string, addonId: string): void {
    for (const [key, row] of [...this.rows]) {
      if (row.orgId === orgId && row.addonId === addonId) {
        this.rows.delete(key);
      }
    }
  }
  recordFire(instanceId: string, runKey: string, firedAt: number): boolean {
    const key = `${instanceId}/${runKey}`;
    const seen = this.fires.get(key);
    if (seen !== undefined && firedAt - seen < this.ttlMs) {
      return false;
    }
    this.fires.set(key, firedAt);
    return true;
  }
  cleanupFires(olderThan: number): void {
    for (const [key, at] of [...this.fires]) {
      if (at < olderThan) {
        this.fires.delete(key);
      }
    }
  }
}

export class InMemoryJobs extends JobStateRepositoryPort {
  rows = new Map<string, JobStateRow>();
  runs: Array<{ key: string; ranAt: number; status: string | null }> = [];
  list(orgId: string, addonId?: string): JobStateRow[] {
    return this.listAll().filter(
      (row) => row.orgId === orgId && (addonId === undefined || row.addonId === addonId),
    );
  }
  listAll(): JobStateRow[] {
    return [...this.rows.values()];
  }
  find(orgId: string, addonId: string, jobId: string): JobStateRow | null {
    return this.rows.get(`${orgId}/${addonId}/${jobId}`) ?? null;
  }
  upsert(row: JobStateRow): void {
    this.rows.set(`${row.orgId}/${row.addonId}/${row.jobId}`, { ...row });
  }
  recordRun(
    orgId: string,
    addonId: string,
    jobId: string,
    ranAt: number,
    status: string | null,
  ): void {
    this.runs.push({ key: `${orgId}/${addonId}/${jobId}`, ranAt, status });
    const row = this.rows.get(`${orgId}/${addonId}/${jobId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}/${jobId}`, {
        ...row,
        lastRunAt: ranAt,
        lastStatus: status,
      });
    }
  }
  setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    const row = this.rows.get(`${orgId}/${addonId}/${jobId}`);
    if (row) {
      this.rows.set(`${orgId}/${addonId}/${jobId}`, { ...row, enabled });
    }
  }
  removeAddon(orgId: string, addonId: string): void {
    for (const [key, row] of [...this.rows]) {
      if (row.orgId === orgId && row.addonId === addonId) {
        this.rows.delete(key);
      }
    }
  }
}

export class InMemoryBindings extends BindingRepositoryPort {
  rows: AddonBindingRow[] = [];
  list(orgId: string, addonId?: string): AddonBindingRow[] {
    return this.rows.filter(
      (row) => row.orgId === orgId && (addonId === undefined || row.addonId === addonId),
    );
  }
  accountsFor(orgId: string, addonId: string, connectionId: string): AddonBindingRow[] {
    return this.rows.filter(
      (row) => row.orgId === orgId && row.addonId === addonId && row.connectionId === connectionId,
    );
  }
  byAccount(orgId: string, accountId: string): AddonBindingRow[] {
    return this.rows.filter((row) => row.orgId === orgId && row.accountId === accountId);
  }
  add(row: AddonBindingRow): void {
    this.rows.push({ ...row });
  }
  remove(orgId: string, addonId: string, connectionId: string, accountId: string): void {
    this.rows = this.rows.filter(
      (row) =>
        !(
          row.orgId === orgId &&
          row.addonId === addonId &&
          row.connectionId === connectionId &&
          row.accountId === accountId
        ),
    );
  }
  setBindings(
    orgId: string,
    addonId: string,
    connectionId: string,
    accountIds: readonly string[],
  ): void {
    this.rows = this.rows.filter(
      (row) =>
        !(row.orgId === orgId && row.addonId === addonId && row.connectionId === connectionId),
    );
    for (const accountId of accountIds) {
      this.rows.push({ orgId, addonId, connectionId, accountId, createdAt: 'now' });
    }
  }
  removeAddon(orgId: string, addonId: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.addonId === addonId));
  }
}
