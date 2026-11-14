import type { JsonObject } from '@harnesys/sdk';
import type { AddonBindingRow } from '../../../../domain/addons/ports/binding-repository.port.ts';
import { BindingRepositoryPort } from '../../../../domain/addons/ports/binding-repository.port.ts';
import type {
  EnsureRunReason,
  InstanceSnapshot,
} from '../../../../domain/addons/ports/instance-supervisor.port.ts';
import { InstanceSupervisorPort } from '../../../../domain/addons/ports/instance-supervisor.port.ts';
import type { JobStateRow } from '../../../../domain/addons/ports/job-state-repository.port.ts';
import { JobStateRepositoryPort } from '../../../../domain/addons/ports/job-state-repository.port.ts';
import type { OrgAddonRow } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import type {
  HostEventEnvelope,
  HostEventHandler,
  HostEventSubscription,
} from '../../../../domain/events/event-bus.port.ts';
import { EventBusPort } from '../../../../domain/events/event-bus.port.ts';

export class FakeBindingRepository extends BindingRepositoryPort {
  rows: AddonBindingRow[] = [];
  override list(): AddonBindingRow[] {
    return [...this.rows];
  }
  override accountsFor(orgId: string, addonId: string, connectionId: string): AddonBindingRow[] {
    return this.rows.filter(
      (row) => row.orgId === orgId && row.addonId === addonId && row.connectionId === connectionId,
    );
  }
  override byAccount(orgId: string, accountId: string): AddonBindingRow[] {
    return this.rows.filter((row) => row.orgId === orgId && row.accountId === accountId);
  }
  override add(row: AddonBindingRow): void {
    this.rows.push(row);
  }
  override remove(): void {}
  override setBindings(): void {}
  override removeAddon(orgId: string, addonId: string): void {
    this.rows = this.rows.filter((row) => !(row.orgId === orgId && row.addonId === addonId));
  }
}

export class FakeOrgAddonRepository extends OrgAddonRepositoryPort {
  rows = new Map<string, OrgAddonRow>();
  override list(): OrgAddonRow[] {
    return [...this.rows.values()];
  }
  override listAll(): OrgAddonRow[] {
    return [...this.rows.values()];
  }
  override find(orgId: string, addonId: string): OrgAddonRow | null {
    return this.rows.get(`${orgId}/${addonId}`) ?? null;
  }
  override upsert(row: OrgAddonRow): void {
    this.rows.set(`${row.orgId}/${row.addonId}`, row);
  }
  override setEnabled(orgId: string, addonId: string, enabled: boolean): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row !== undefined) {
      row.enabled = enabled;
    }
  }
  override updateGrants(): void {}
  override updateConfig(orgId: string, addonId: string, configJson: string): void {
    const row = this.rows.get(`${orgId}/${addonId}`);
    if (row !== undefined) {
      row.configJson = configJson;
    }
  }
  override updateHealth(): void {}
  override remove(orgId: string, addonId: string): void {
    this.rows.delete(`${orgId}/${addonId}`);
  }
}

export class FakeTriggerInstanceRepository extends TriggerInstanceRepositoryPort {
  rows = new Map<string, TriggerInstanceRow>();
  fires = new Set<string>();
  override list(orgId: string, addonId?: string): TriggerInstanceRow[] {
    return [...this.rows.values()].filter(
      (row) => row.orgId === orgId && (addonId === undefined || row.addonId === addonId),
    );
  }
  override find(orgId: string, instanceId: string): TriggerInstanceRow | null {
    return this.rows.get(`${orgId}/${instanceId}`) ?? null;
  }
  override create(row: TriggerInstanceRow): TriggerInstanceRow {
    this.rows.set(`${row.orgId}/${row.id}`, row);
    return row;
  }
  override update(orgId: string, instanceId: string, patch: TriggerInstancePatch): void {
    const row = this.rows.get(`${orgId}/${instanceId}`);
    if (row !== undefined) {
      Object.assign(row, patch);
    }
  }
  override remove(orgId: string, instanceId: string): void {
    this.rows.delete(`${orgId}/${instanceId}`);
  }
  override removeAddon(): void {}
  override recordFire(instanceId: string, runKey: string, _firedAt: number): boolean {
    const key = `${instanceId}/${runKey}`;
    if (this.fires.has(key)) {
      return false;
    }
    this.fires.add(key);
    return true;
  }
  override cleanupFires(): void {}
}

export class FakeJobStateRepository extends JobStateRepositoryPort {
  rows = new Map<string, JobStateRow>();
  override list(): JobStateRow[] {
    return [...this.rows.values()];
  }
  override listAll(): JobStateRow[] {
    return [...this.rows.values()];
  }
  override find(orgId: string, addonId: string, jobId: string): JobStateRow | null {
    return this.rows.get(`${orgId}/${addonId}/${jobId}`) ?? null;
  }
  override upsert(row: JobStateRow): void {
    this.rows.set(`${row.orgId}/${row.addonId}/${row.jobId}`, row);
  }
  override recordRun(
    orgId: string,
    addonId: string,
    jobId: string,
    ranAt: number,
    status: string | null,
  ): void {
    const row = this.rows.get(`${orgId}/${addonId}/${jobId}`);
    if (row !== undefined) {
      row.lastRunAt = ranAt;
      row.lastStatus = status;
    }
  }
  override setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    const row = this.rows.get(`${orgId}/${addonId}/${jobId}`);
    if (row !== undefined) {
      row.enabled = enabled;
    }
  }
  override removeAddon(orgId: string, addonId: string): void {
    for (const key of this.rows.keys()) {
      if (key.startsWith(`${orgId}/${addonId}/`)) {
        this.rows.delete(key);
      }
    }
  }
}

export class FakeInstanceSupervisor extends InstanceSupervisorPort {
  ensureCalls: EnsureRunReason[] = [];
  override async ensureRunning(
    orgId: string,
    addonId: string,
    reason: EnsureRunReason,
  ): Promise<InstanceSnapshot> {
    this.ensureCalls.push(reason);
    return {
      orgId,
      addonId,
      generation: 1,
      state: 'running',
      restarts: 0,
    };
  }
  override async stop(): Promise<void> {}
  override async restart(): Promise<InstanceSnapshot> {
    return { orgId: '', addonId: '', generation: 0, state: 'running', restarts: 0 };
  }
  override snapshot(): InstanceSnapshot | null {
    return null;
  }
  override mirrorHealth(): void {}
}

export interface PublishedEvent {
  orgId: string;
  name: string;
  payload: unknown;
}

export class FakeEventBus extends EventBusPort {
  readonly published: PublishedEvent[] = [];
  private readonly handlers = new Map<string, Set<HostEventHandler>>();

  override publish(orgId: string, name: string, payload: unknown): void {
    this.published.push({ orgId, name, payload });
    for (const handler of this.matching(orgId, name)) {
      handler(this.envelope(orgId, name, payload));
    }
  }

  override subscribe(
    orgId: string,
    patterns: readonly string[],
    handler: HostEventHandler,
  ): HostEventSubscription {
    for (const pattern of patterns) {
      const key = `${orgId}::${pattern}`;
      const set = this.handlers.get(key) ?? new Set<HostEventHandler>();
      set.add(handler);
      this.handlers.set(key, set);
    }
    return {
      close: () => {
        for (const pattern of patterns) {
          this.handlers.get(`${orgId}::${pattern}`)?.delete(handler);
        }
      },
    };
  }

  emit(orgId: string, name: string, payload: JsonObject): void {
    this.publish(orgId, name, payload);
  }

  private matching(orgId: string, name: string): HostEventHandler[] {
    const found: HostEventHandler[] = [];
    for (const [key, set] of this.handlers.entries()) {
      if (!key.startsWith(`${orgId}::`)) {
        continue;
      }
      const pattern = key.split('::')[1];
      if (pattern === undefined) {
        continue;
      }
      if (patternMatch(pattern, name)) {
        found.push(...set);
      }
    }
    return found;
  }

  private envelope(orgId: string, name: string, payload: unknown): HostEventEnvelope {
    return { name, version: 1, orgId, occurredAt: new Date().toISOString(), payload };
  }
}

function patternMatch(pattern: string, name: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('.*')) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return pattern === name;
}
