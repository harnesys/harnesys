import { join } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import type {
  AddonConfigDescriptor,
  AddonConfigValues,
  AddonContribution,
  AddonDetail,
  AddonFamily,
  AddonLogLine,
  AddonState,
  AddonSummary,
} from '@harnesys/contracts';
import { AddonCatalogPort, type AddonStateRecord } from '../../domain/addons/addon-catalog.port.ts';
import { AddonHostPort } from '../../domain/addons/addon-host.port.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonDiscovery, type DiscoveredAddon } from './addon-discovery.ts';
import { AddonLogBuffer } from './addon-log-buffer.ts';
import { ADDON_LOG_TOPIC } from './addon-topic.ts';
import { type AddonRegisterResult, AddonWorker } from './addon-worker.ts';

interface RunningAddon {
  readonly worker: AddonWorker;
  readonly contributions: AddonContribution[];
}

@Injectable()
export class AddonHost extends AddonHostPort {
  private readonly log: Logger;
  private readonly running = new Map<string, RunningAddon>();
  private readonly logs = new Map<string, AddonLogBuffer>();

  constructor(
    private readonly discovery: AddonDiscovery,
    private readonly catalog: AddonCatalogPort,
    private readonly hub: EventsWatchHubPort,
    private readonly layout: HostFsLayoutPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('addon-host');
  }

  override async onModuleDestroy(): Promise<void> {
    for (const entry of this.running.values()) {
      await entry.worker.stop().catch(() => undefined);
    }
    this.running.clear();
  }

  override list(orgId: string): AddonSummary[] {
    const rows = this.catalog.list(orgId);
    const records = new Map<string, AddonStateRecord>(rows.map((row) => [row.id, row]));
    return this.discovery
      .list()
      .map((addon) => this.summaryOf(orgId, addon, records.get(addon.id)));
  }

  override detail(orgId: string, addonId: string): AddonDetail {
    const addon = this.findAddon(addonId);
    const record = this.catalog.find(orgId, addonId);
    const contributions = this.contributionsOf(orgId, addon);
    const configRecord = this.catalog.readConfig(orgId, addonId);
    return {
      id: addon.id,
      version: addon.version,
      state: record?.state ?? 'discovered',
      execution: addon.manifest.execution,
      title: addon.title,
      description: addon.description,
      icon: addon.icon,
      tags: [...addon.tags],
      families: familiesOf(contributions, addon),
      entry: addon.entry,
      root: addon.root,
      running: this.isRunning(orgId, addon.id),
      contributions,
      ...(configDescriptorOf(contributions) ? { config: configDescriptorOf(contributions) } : {}),
      values: configRecord?.values ?? {},
    };
  }

  override async enable(orgId: string, addonId: string): Promise<AddonSummary> {
    const addon = this.findAddon(addonId);
    const worker = new AddonWorker({
      orgId,
      addonId,
      version: addon.version,
      root: addon.root,
      entryPath: addon.entry,
      dataDir: this.addonDataDir(orgId, addonId),
      onLog: (line) => this.recordLog(orgId, addonId, line),
      onExit: (id, code) => this.handleExit(orgId, id, code),
    });
    const registered = await worker.start();
    this.running.set(this.keyOf(orgId, addonId), {
      worker,
      contributions: normalizeContributions(registered),
    });
    const stored = this.catalog.readConfig(orgId, addonId);
    if (stored) {
      await worker.call('config.set', { values: stored.values });
    }
    const now = new Date().toISOString();
    const record = this.catalog.upsert(toRecord(orgId, addon, 'enabled', now, now));
    this.recordLog(orgId, addonId, {
      seq: this.nextSeq(orgId, addonId),
      at: now,
      level: 'info',
      message: 'addon enabled',
      fields: {},
    });
    return this.summaryOf(orgId, addon, record);
  }

  override async disable(orgId: string, addonId: string): Promise<AddonSummary> {
    const addon = this.findAddon(addonId);
    const entry = this.running.get(this.keyOf(orgId, addonId));
    if (entry) {
      await entry.worker.stop();
      this.running.delete(this.keyOf(orgId, addonId));
    }
    const now = new Date().toISOString();
    const record = this.catalog.upsert(toRecord(orgId, addon, 'installed', now, now));
    return this.summaryOf(orgId, addon, record);
  }

  override async setConfig(
    orgId: string,
    addonId: string,
    values: AddonConfigValues,
  ): Promise<AddonConfigValues> {
    this.findAddon(addonId);
    const entry = this.running.get(this.keyOf(orgId, addonId));
    if (entry) {
      const result = (await entry.worker.call('config.set', { values })) as {
        values?: AddonConfigValues;
      };
      const applied = result.values ?? values;
      this.catalog.writeConfig(orgId, addonId, applied);
      this.recordLog(orgId, addonId, {
        seq: this.nextSeq(orgId, addonId),
        at: new Date().toISOString(),
        level: 'debug',
        message: 'config applied to running addon',
        fields: { keys: Object.keys(applied) },
      });
      return applied;
    }
    const merged = { ...(this.catalog.readConfig(orgId, addonId)?.values ?? {}), ...values };
    this.catalog.writeConfig(orgId, addonId, merged);
    return merged;
  }

  override logsOf(orgId: string, addonId: string, since = 0): AddonLogLine[] {
    return this.logs.get(this.keyOf(orgId, addonId))?.since(since) ?? [];
  }

  private isRunning(orgId: string, addonId: string): boolean {
    return this.running.get(this.keyOf(orgId, addonId))?.worker.alive ?? false;
  }

  private contributionsOf(orgId: string, addon: DiscoveredAddon): AddonContribution[] {
    const runningEntry = this.running.get(this.keyOf(orgId, addon.id));
    if (runningEntry) {
      return runningEntry.contributions;
    }
    return manifestContributions(addon);
  }

  private findAddon(addonId: string): DiscoveredAddon {
    const addon = this.discovery.list().find((entry) => entry.id === addonId);
    if (!addon) {
      throw new AddonNotFoundError(addonId);
    }
    return addon;
  }

  private summaryOf(
    orgId: string,
    addon: DiscoveredAddon,
    record: AddonStateRecord | undefined,
  ): AddonSummary {
    const contributions = this.contributionsOf(orgId, addon);
    return {
      id: addon.id,
      version: addon.version,
      state: record?.state ?? 'discovered',
      execution: addon.manifest.execution,
      title: record?.title ?? addon.title,
      description: record?.description ?? addon.description,
      icon: record?.icon ?? addon.icon,
      tags: [...(record?.tags ?? addon.tags)],
      families: familiesOf(contributions, addon),
    };
  }

  private addonDataDir(orgId: string, addonId: string): string {
    return join(this.layout.orgDataDir(orgId), 'addons', addonId);
  }

  private keyOf(orgId: string, addonId: string): string {
    return `${orgId}::${addonId}`;
  }

  private nextSeq(orgId: string, addonId: string): number {
    return (this.logs.get(this.keyOf(orgId, addonId))?.tail(1)[0]?.seq ?? 0) + 1;
  }

  private recordLog(orgId: string, addonId: string, line: AddonLogLine): void {
    const key = this.keyOf(orgId, addonId);
    const buffer = this.logs.get(key) ?? new AddonLogBuffer();
    const stored = buffer.push(line);
    this.logs.set(key, buffer);
    this.hub.publish(orgId, ADDON_LOG_TOPIC, { addonId, line: stored });
    this.log.info({ addonId, level: stored.level }, stored.message);
  }

  private handleExit(orgId: string, addonId: string, code: number | null): void {
    const key = this.keyOf(orgId, addonId);
    this.running.delete(key);
    const existing = this.catalog.find(orgId, addonId);
    if (existing?.state === 'enabled') {
      this.catalog.upsert({ ...existing, state: 'installed', updatedAt: new Date().toISOString() });
    }
    this.recordLog(orgId, addonId, {
      seq: this.nextSeq(orgId, addonId),
      at: new Date().toISOString(),
      level: 'warn',
      message: 'addon process exited',
      fields: { code },
    });
  }
}

export class AddonNotFoundError extends Error {
  constructor(addonId: string) {
    super(`addon not found: ${addonId}`);
    this.name = 'AddonNotFoundError';
  }
}

function toRecord(
  orgId: string,
  addon: DiscoveredAddon,
  state: AddonState,
  now: string,
  createdAt: string,
): AddonStateRecord {
  return {
    id: addon.id,
    orgId,
    version: addon.version,
    title: addon.title,
    description: addon.description,
    icon: addon.icon,
    tags: [...addon.tags],
    root: addon.root,
    entry: addon.entry,
    state,
    createdAt,
    updatedAt: now,
  };
}

function manifestContributions(addon: DiscoveredAddon): AddonContribution[] {
  return addon.manifest.contributions.map((entry) => ({
    id: entry.id,
    family: entry.family,
    descriptor: entry.descriptor,
  }));
}

function normalizeContributions(result: AddonRegisterResult): AddonContribution[] {
  return result.contributions.map((entry) => ({
    id: entry.id,
    family: entry.family as AddonFamily,
    descriptor: entry.descriptor,
  }));
}

function configDescriptorOf(contributions: AddonContribution[]): AddonConfigDescriptor | undefined {
  const entry = contributions.find((item) => item.family === 'config');
  if (!entry) {
    return undefined;
  }
  return isConfigDescriptor(entry.descriptor) ? entry.descriptor : undefined;
}

function isConfigDescriptor(value: Record<string, unknown>): value is AddonConfigDescriptor {
  return Array.isArray(value.fields);
}

function familiesOf(contributions: AddonContribution[], addon: DiscoveredAddon): AddonFamily[] {
  const fromRunning = new Set(contributions.map((entry) => entry.family));
  if (fromRunning.size > 0) {
    return [...fromRunning];
  }
  return [...new Set(addon.manifest.contributions.map((entry) => entry.family))];
}
