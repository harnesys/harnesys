import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@harnesys/brix';
import { type JsonObject } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { TriggerStopReason } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { mergeTriggerConfig } from '../../../domain/addons/trigger-config.ts';
import { AutomationEventsPort } from '../../../domain/automations/automation-events.port.ts';
import { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import { TriggerWorkspacePort } from '../../../domain/thread/trigger-workspace.port.ts';
import { occupiedTriggerInstanceThreadId } from '../../threads/trigger-thread-binding.ts';
import { requirePackage } from '../orgs/org-addon.helpers.ts';
import { parseTriggerConfigJson, triggerDescriptorOf } from './trigger-descriptor.ts';
import type { TriggerTarget } from './trigger-target.schema.ts';
import { scriptsIssueMessages, TriggerTargetSchema } from './trigger-target.schema.ts';

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
  actorUserId?: string | null;
}

export interface TriggerInstanceActionInput {
  orgId: string;
  instanceId: string;
}

@Injectable()
export class ManageTriggerInstanceUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly audit: AddonAuditPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly automationEvents: AutomationEventsPort,
    private readonly triggerWorkspace: TriggerWorkspacePort,
    private readonly scriptRuns: TriggerScriptRunRepositoryPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-trigger-instances');
  }

  async create(input: CreateTriggerInstanceInput): Promise<TriggerInstanceRow> {
    const row = this.orgAddons.find(input.orgId, input.addonId);
    if (!row?.enabled) {
      throw new AddonException('conflict', 409, `Addon is not enabled: ${input.addonId}`);
    }
    const pkg = requirePackage(this.catalog, input.addonId, row.version);
    const descriptor = triggerDescriptorOf(pkg.manifest, input.triggerId);
    const target = this.assertTarget(input.orgId, input.target);
    this.applyTargetWorkspace(input.orgId, target);
    const config = mergeTriggerConfig(descriptor, {}, input.config);
    const now = new Date().toISOString();
    const created = this.triggers.create({
      id: randomUUID(),
      orgId: input.orgId,
      addonId: input.addonId,
      triggerId: input.triggerId,
      label: input.label,
      configJson: JSON.stringify(config),
      instructions: input.instructions ?? '',
      targetJson: JSON.stringify(target),
      enabled: input.enabled ?? true,
      createdByUserId: input.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    if (created.enabled) {
      try {
        await this.start(created);
      } catch (error) {
        await this.stop(created.id, input.orgId, input.addonId, 'removed');
        this.triggers.remove(input.orgId, created.id);
        throw error;
      }
    }
    this.audit.append(input.orgId, {
      at: now,
      actor: input.actor,
      action: 'addon.trigger_instance.create',
      target: `${input.addonId}/${input.triggerId}`,
      outcome: 'ok',
      details: { instanceId: created.id },
    });
    this.emitChanged(input.orgId, input.addonId, input.triggerId, 'changed');
    return created;
  }

  async enable(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    this.triggers.update(input.orgId, input.instanceId, { enabled: true });
    try {
      await this.start({ ...instance, enabled: true });
    } catch (error) {
      this.triggers.update(input.orgId, input.instanceId, { enabled: false });
      this.emitChanged(input.orgId, instance.addonId, instance.triggerId, 'changed');
      throw error;
    }
    this.emitChanged(input.orgId, instance.addonId, instance.triggerId, 'changed');
  }

  async disable(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    await this.stop(instance.id, input.orgId, instance.addonId, 'paused');
    this.triggers.update(input.orgId, input.instanceId, { enabled: false });
    this.emitChanged(input.orgId, instance.addonId, instance.triggerId, 'changed');
  }

  async delete(input: TriggerInstanceActionInput): Promise<void> {
    const instance = this.require(input.orgId, input.instanceId);
    await this.stop(instance.id, input.orgId, instance.addonId, 'removed');
    this.triggers.remove(input.orgId, input.instanceId);
    this.scriptRuns.removePendingForInstance(input.orgId, input.instanceId);
    this.emitChanged(input.orgId, instance.addonId, instance.triggerId, 'removed');
  }

  async patch(orgId: string, instanceId: string, patch: TriggerInstancePatch): Promise<void> {
    const current = this.require(orgId, instanceId);
    const effective: TriggerInstancePatch =
      patch.configJson === undefined
        ? patch
        : { ...patch, configJson: this.mergedConfigJson(orgId, current, patch.configJson) };
    const patchedTarget =
      effective.targetJson === undefined
        ? undefined
        : this.assertTarget(orgId, this.parseTarget(effective.targetJson), instanceId);
    if (
      patchedTarget !== undefined &&
      !sameWorkspace(workspaceOf(current.targetJson), patchedTarget.workspace)
    ) {
      this.applyTargetWorkspace(orgId, patchedTarget);
    }
    const disabling = effective.enabled === false && current.enabled;
    const enabling = effective.enabled === true && !current.enabled;
    if (disabling) {
      await this.stop(instanceId, orgId, current.addonId, 'paused');
    }
    const nextPatch =
      patchedTarget === undefined
        ? effective
        : { ...effective, targetJson: JSON.stringify(patchedTarget) };
    this.triggers.update(orgId, instanceId, nextPatch);
    const resynced = this.require(orgId, instanceId);
    const contentChanged =
      effective.label !== undefined ||
      effective.configJson !== undefined ||
      effective.instructions !== undefined;
    if (resynced.enabled && (contentChanged || enabling)) {
      try {
        await this.start(resynced);
      } catch (error) {
        this.triggers.update(orgId, instanceId, { enabled: false });
        await this.stop(instanceId, orgId, current.addonId, 'paused');
        this.emitChanged(orgId, current.addonId, current.triggerId, 'changed');
        throw error;
      }
    }
    this.emitChanged(orgId, current.addonId, current.triggerId, 'changed');
  }

  private async start(instance: TriggerInstanceRow): Promise<void> {
    await this.calls.triggerStart(instance.orgId, instance.addonId, {
      instanceId: instance.id,
      kind: instance.triggerId,
      label: instance.label,
      config: this.configOf(instance),
      target: this.targetOf(instance),
      instructions: instance.instructions,
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

  private async stop(
    instanceId: string,
    orgId: string,
    addonId: string,
    reason: TriggerStopReason,
  ): Promise<void> {
    try {
      await this.calls.triggerStop(orgId, addonId, { instanceId, reason });
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

  private emitChanged(
    orgId: string,
    addonId: string,
    triggerId: string,
    action: 'changed' | 'removed',
  ): void {
    this.automationEvents.publish(orgId, { kind: `${addonId}.${triggerId}`, action });
  }

  private mergedConfigJson(
    orgId: string,
    instance: TriggerInstanceRow,
    configJson: string,
  ): string {
    const parsed = parseTriggerConfigJson(configJson);
    const addon = this.orgAddons.find(orgId, instance.addonId);
    if (!addon) {
      throw new AddonException('conflict', 409, `Addon is not installed: ${instance.addonId}`);
    }
    const pkg = requirePackage(this.catalog, instance.addonId, addon.version);
    const descriptor = triggerDescriptorOf(pkg.manifest, instance.triggerId);
    const config = mergeTriggerConfig(descriptor, this.configOf(instance), parsed);
    return JSON.stringify(config);
  }

  private assertTarget(orgId: string, target: unknown, exceptInstanceId?: string): TriggerTarget {
    const parsed = TriggerTargetSchema.safeParse(target);
    if (!parsed.success) {
      const scriptsIssues = scriptsIssueMessages(parsed.error);
      throw new AddonException(
        'invalid_params',
        422,
        scriptsIssues.length === 0
          ? 'target must be an object with threadId, agentId, optional modeId, workspace and scripts'
          : scriptsIssues.join('; '),
      );
    }
    const thread = this.threads.findById(orgId, parsed.data.threadId);
    if (!thread || thread.orgId !== orgId) {
      throw new AddonException('invalid_params', 422, 'target.threadId not found');
    }
    if (
      parsed.data.workspace !== undefined &&
      (thread.kind === 'issue' || thread.kind === 'group')
    ) {
      throw new AddonException(
        'invalid_params',
        422,
        `target.workspace is not supported for ${thread.kind} threads`,
      );
    }
    const members = this.threadAgents.listByThread(orgId, thread.id);
    if (!members.some((member) => member.agentId === parsed.data.agentId)) {
      throw new AddonException('invalid_params', 422, 'target.agentId is not a thread member');
    }
    const occupied = occupiedTriggerInstanceThreadId(
      this.triggers.list(orgId),
      thread.id,
      exceptInstanceId,
    );
    if (occupied) {
      throw new AddonException('invalid_params', 422, 'thread already has a trigger');
    }
    return parsed.data;
  }

  private applyTargetWorkspace(orgId: string, target: TriggerTarget): void {
    if (target.workspace === undefined) {
      return;
    }
    try {
      this.triggerWorkspace.apply({
        orgId,
        threadId: target.threadId,
        workspace: target.workspace,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AddonException('invalid_params', 422, `target.workspace rejected: ${message}`);
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

function workspaceOf(targetJson: string): unknown {
  try {
    const parsed: unknown = JSON.parse(targetJson);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).workspace
      : undefined;
  } catch {
    return undefined;
  }
}

function sameWorkspace(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
