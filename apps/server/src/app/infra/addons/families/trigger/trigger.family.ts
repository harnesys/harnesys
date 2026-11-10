import { Injectable } from '@harnesys/brix';
import type { AutomationItem, AutomationKind } from '@harnesys/contracts';
import { TriggerDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import type { AddonCallOptions } from '../../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import { BindingRepositoryPort } from '../../../../domain/addons/ports/binding-repository.port.ts';
import { InstanceSupervisorPort } from '../../../../domain/addons/ports/instance-supervisor.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import type { TriggerInstanceRow } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AutomationCatalogContributorPort } from '../../../../domain/automations/automation-catalog-contributor.port.ts';
import { l10nText } from '../shared.ts';

type TriggerSchema = z.infer<typeof TriggerDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [
  handlerSpec('trigger.start'),
  handlerSpec('trigger.stop'),
];

interface KindEntry {
  owner: OwnerKey;
  descriptor: TriggerSchema;
}

export function globalTriggerKind(addonId: string, kind: string): string {
  return `${addonId}.${kind}`;
}

@Injectable()
export class AddonTriggerCatalogContributor extends AutomationCatalogContributorPort {
  private readonly entries = new Map<string, KindEntry>();

  add(owner: OwnerKey, descriptor: TriggerSchema): void {
    this.entries.set(ownerKeyId(owner), { owner, descriptor });
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  override kinds(orgId: string): AutomationKind[] {
    const kinds: AutomationKind[] = [];
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId !== orgId) {
        continue;
      }
      const connected = this.connectionConnected(entry.owner, entry.descriptor);
      kinds.push({
        kind: globalTriggerKind(entry.owner.addonId, entry.descriptor.kind),
        integrationId: entry.owner.addonId,
        label: l10nText(entry.descriptor.title),
        description: l10nText(entry.descriptor.description),
        icon: 'zap',
        requiresConnection: entry.descriptor.connection !== undefined,
        connected,
      });
    }
    return kinds;
  }

  override items(orgId: string): AutomationItem[] {
    const items: AutomationItem[] = [];
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId !== orgId) {
        continue;
      }
      items.push(...this.itemsForEntry(orgId, entry));
    }
    return items;
  }

  private itemsForEntry(orgId: string, entry: KindEntry): AutomationItem[] {
    const connected = this.connectionConnected(entry.owner, entry.descriptor);
    return this.instances
      .list(orgId, entry.owner.addonId)
      .filter((row) => row.triggerId === entry.descriptor.kind)
      .map((row) => this.itemOfRow(orgId, entry, row, connected));
  }

  private itemOfRow(
    orgId: string,
    entry: KindEntry,
    row: TriggerInstanceRow,
    connected: boolean,
  ): AutomationItem {
    const target = parseTarget(row.targetJson);
    return {
      id: row.id,
      orgId,
      integrationId: entry.owner.addonId,
      kind: globalTriggerKind(entry.owner.addonId, row.triggerId),
      label: row.label,
      description: '',
      status: row.enabled ? 'active' : 'paused',
      threadId: typeof target.threadId === 'string' ? target.threadId : null,
      targetAgentId: typeof target.agentId === 'string' ? target.agentId : null,
      connection: {
        required: entry.descriptor.connection !== undefined,
        connected,
      },
      meta: {},
      availableAt: null,
      updatedAt: row.updatedAt,
    };
  }

  private connectionConnected(owner: OwnerKey, descriptor: TriggerSchema): boolean {
    const addon = this.orgAddons.find(owner.orgId, owner.addonId);
    if (addon === null || !addon.enabled) {
      return false;
    }
    if (descriptor.connection === undefined) {
      return true;
    }
    return this.bindings.accountsFor(owner.orgId, owner.addonId, descriptor.connection).length > 0;
  }

  constructor(
    private readonly instances: TriggerInstanceRepositoryPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {
    super();
  }
}

function parseTarget(targetJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(targetJson);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

const TRIGGER_CALL_TIMEOUT_MS = 15_000;

export interface TriggerInstanceStartInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  kind: string;
  config: Record<string, unknown>;
  target?: unknown;
}

@Injectable()
export class TriggerFamilyModule implements FamilyModule<TriggerSchema> {
  readonly family = 'trigger';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    readonly contributor: AddonTriggerCatalogContributor,
    private readonly calls: AddonCallPort,
    private readonly supervisor: InstanceSupervisorPort,
  ) {}

  schema(_v: number): z.ZodType<TriggerSchema> {
    return TriggerDescriptorSchema as z.ZodType<TriggerSchema>;
  }

  register(owner: OwnerKey, d: TriggerSchema): Disposable {
    this.contributor.add(owner, d);
    return {
      dispose: () => {
        this.contributor.removeOwner(owner);
      },
    };
  }

  async startInstance(input: TriggerInstanceStartInput, opts?: AddonCallOptions): Promise<void> {
    const { orgId, addonId, instanceId, kind, config, target } = input;
    await this.supervisor.ensureRunning(orgId, addonId, `trigger-instance:${instanceId}`);
    await this.calls.triggerStart(
      orgId,
      addonId,
      { instanceId, kind, config, target },
      opts ?? { timeoutMs: TRIGGER_CALL_TIMEOUT_MS },
    );
  }

  async stopInstance(
    orgId: string,
    addonId: string,
    instanceId: string,
    opts?: AddonCallOptions,
  ): Promise<void> {
    await this.calls.triggerStop(
      orgId,
      addonId,
      { instanceId },
      opts ?? { timeoutMs: TRIGGER_CALL_TIMEOUT_MS },
    );
  }
}
