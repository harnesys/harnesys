import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { JsonObject } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { requirePackage } from '../orgs/org-addon.helpers.ts';

export interface CreateTriggerInstanceInput {
  orgId: string;
  addonId: string;
  triggerId: string;
  label: string;
  config: JsonObject;
  instructions?: string;
  target?: unknown;
  enabled?: boolean;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

export interface TriggerInstanceActionInput {
  orgId: string;
  instanceId: string;
}

const TARGET_FIELDS = ['threadId', 'agentId'] as const;

@Injectable()
export class ManageTriggerInstanceUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-trigger-instances');
  }

  create(input: CreateTriggerInstanceInput): TriggerInstanceRow {
    const row = this.orgAddons.find(input.orgId, input.addonId);
    if (!row?.enabled) {
      throw new AddonException('conflict', 409, `Addon is not enabled: ${input.addonId}`);
    }
    const pkg = requirePackage(this.catalog, input.addonId, row.version);
    this.assertTriggerDeclared(pkg.manifest, input.triggerId);
    this.assertTarget(input.target);
    const now = new Date().toISOString();
    const created = this.triggers.create({
      id: randomUUID(),
      orgId: input.orgId,
      addonId: input.addonId,
      triggerId: input.triggerId,
      label: input.label,
      configJson: JSON.stringify(input.config),
      instructions: input.instructions ?? '',
      targetJson: JSON.stringify(input.target ?? null),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    if (created.enabled) {
      void this.start(created);
    }
    this.audit.append(input.orgId, {
      at: now,
      actor: input.actor,
      action: 'addon.trigger_instance.create',
      target: `${input.addonId}/${input.triggerId}`,
      outcome: 'ok',
      details: { instanceId: created.id },
    });
    return created;
  }

  async enable(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    this.triggers.update(input.orgId, input.instanceId, { enabled: true });
    await this.start({ ...instance, enabled: true });
  }

  async disable(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    await this.stop(instance.id, input.orgId, instance.addonId);
    this.triggers.update(input.orgId, input.instanceId, { enabled: false });
  }

  async delete(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    if (instance.enabled) {
      await this.stop(instance.id, input.orgId, instance.addonId);
    }
    this.triggers.remove(input.orgId, input.instanceId);
  }

  patch(orgId: string, instanceId: string, patch: TriggerInstancePatch): void {
    this.require(orgId, instanceId);
    if (patch.targetJson !== undefined) {
      this.assertTarget(this.parseTarget(patch.targetJson));
    }
    this.triggers.update(orgId, instanceId, patch);
  }

  private async start(instance: TriggerInstanceRow): Promise<void> {
    await this.calls.triggerStart(instance.orgId, instance.addonId, {
      instanceId: instance.id,
      kind: instance.triggerId,
      config: this.configOf(instance),
      target: this.targetOf(instance),
    });
  }

  private configOf(instance: TriggerInstanceRow): JsonObject {
    try {
      const parsed: unknown = JSON.parse(instance.configJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as JsonObject)
        : {};
    } catch {
      return {};
    }
  }

  private targetOf(instance: TriggerInstanceRow): unknown {
    try {
      return JSON.parse(instance.targetJson);
    } catch {
      return null;
    }
  }

  private async stop(instanceId: string, orgId: string, addonId: string): Promise<void> {
    try {
      await this.calls.triggerStop(orgId, addonId, { instanceId });
    } catch (error) {
      this.logger.warn({ orgId, addonId, instanceId, error: String(error) }, 'trigger stop failed');
    }
  }

  private require(orgId: string, instanceId: string): TriggerInstanceRow {
    const instance = this.triggers.find(orgId, instanceId);
    if (!instance) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${instanceId}`);
    }
    return instance;
  }

  private assertTriggerDeclared(manifest: AddonManifestLike, triggerId: string): void {
    const declared = manifest.contributions.some(
      (entry) => entry.family === 'trigger' && descriptorKind(entry.descriptor) === triggerId,
    );
    if (!declared) {
      throw new AddonException('not_found', 404, `Trigger kind is not declared: ${triggerId}`);
    }
  }

  private assertTarget(target: unknown): void {
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new AddonException(
        'invalid_params',
        422,
        'target must be an object with threadId and agentId',
      );
    }
    const record = target as Record<string, unknown>;
    for (const field of TARGET_FIELDS) {
      const value = record[field];
      if (typeof value !== 'string' || value.length === 0) {
        throw new AddonException('invalid_params', 422, `target.${field} is required`);
      }
    }
  }

  private parseTarget(json: string): unknown {
    try {
      return JSON.parse(json) as unknown;
    } catch {
      return null;
    }
  }
}

interface AddonManifestLike {
  contributions: Array<{ family: string; descriptor: JsonObject }>;
}

function descriptorKind(descriptor: JsonObject): string | undefined {
  const kind = descriptor.kind;
  return typeof kind === 'string' ? kind : undefined;
}
