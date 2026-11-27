import { Injectable } from '@harnesys/brix';
import { TriggerScriptTestRequestSchema } from '@harnesys/contracts';
import {
  type JsonObject,
  type L10n,
  resolveL10n,
  schemaValueIssues,
  type TriggerDescriptor,
  TriggerDescriptorSchema,
} from '@harnesys/sdk';
import {
  type AutomationActionDescriptor,
  AutomationAdminPort,
  type AutomationCreateInput,
  type AutomationInstance,
  type AutomationScriptTestInput,
  type AutomationTriggerKind,
  type AutomationUpdateInput,
} from 'harnesys';
import { ListTriggerScriptRunsUseCase } from '../../../application/addons/triggers/list-trigger-script-runs.use-case.ts';
import { ManageTriggerInstanceUseCase } from '../../../application/addons/triggers/manage-instance.use-case.ts';
import { TestTriggerScriptUseCase } from '../../../application/addons/triggers/test-trigger-script.use-case.ts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import {
  assertScriptsAllowed,
  mergeTriggerConfig,
  normalizeTargetScripts,
} from '../../../domain/addons/trigger-config.ts';

@Injectable()
export class AutomationAdminAdapter extends AutomationAdminPort {
  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly manage: ManageTriggerInstanceUseCase,
    private readonly scriptRunList: ListTriggerScriptRunsUseCase,
    private readonly scriptTest: TestTriggerScriptUseCase,
    private readonly calls: AddonCallPort,
  ) {
    super();
  }

  listKinds(orgId: string): AutomationTriggerKind[] {
    const kinds: AutomationTriggerKind[] = [];
    for (const row of this.orgAddons.list(orgId)) {
      if (!row.enabled) {
        continue;
      }
      const addonTitle = this.addonTitleOf(row.addonId, row.version);
      for (const descriptor of this.descriptorsOf(row.addonId, row.version)) {
        kinds.push(kindOf(row.addonId, addonTitle, descriptor));
      }
    }
    return kinds;
  }

  list(orgId: string): AutomationInstance[] {
    return this.triggers.list(orgId).map((row) => this.decorate(row));
  }

  get(orgId: string, instanceId: string): AutomationInstance | null {
    const row = this.triggers.find(orgId, instanceId);
    return row === null ? null : this.decorate(row);
  }

  async create(orgId: string, input: AutomationCreateInput): Promise<AutomationInstance> {
    const descriptor = this.requireDescriptor(orgId, input.addonId, input.kind);
    this.assertConnection(orgId, input.addonId, descriptor);
    const target = normalizeTargetScripts(input.target);
    assertScriptsAllowed(descriptor, target);
    const config = mergeTriggerConfig(descriptor, {}, input.config ?? {});
    const created = await this.manage.create({
      orgId,
      addonId: input.addonId,
      triggerId: input.kind,
      label: input.label,
      config: config as JsonObject,
      ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
      target,
      enabled: input.enabled ?? true,
      actor: { kind: 'system', id: 'automations-pack' },
      actorUserId: null,
    });
    return this.decorate(created);
  }

  async update(orgId: string, input: AutomationUpdateInput): Promise<AutomationInstance> {
    const current = this.require(orgId, input.instanceId);
    const descriptor = this.requireDescriptor(orgId, current.addonId, current.triggerId);
    this.assertConnection(orgId, current.addonId, descriptor);
    const patch: TriggerInstancePatch = {};
    if (input.label !== undefined) {
      patch.label = input.label;
    }
    if (input.config !== undefined) {
      const config = mergeTriggerConfig(
        descriptor,
        parseObject(current.configJson) ?? {},
        input.config,
      );
      patch.configJson = JSON.stringify(config);
    }
    if (input.instructions !== undefined) {
      patch.instructions = input.instructions;
    }
    if (input.enabled !== undefined) {
      patch.enabled = input.enabled;
    }
    if (input.target !== undefined) {
      const target = normalizeTargetScripts({
        ...(parseObject(current.targetJson) ?? {}),
        ...input.target,
      });
      assertScriptsAllowed(descriptor, target);
      patch.targetJson = JSON.stringify(target);
    }
    await this.manage.patch(orgId, input.instanceId, patch);
    return this.decorate(this.require(orgId, input.instanceId));
  }

  async setEnabled(orgId: string, instanceId: string, enabled: boolean): Promise<void> {
    this.require(orgId, instanceId);
    if (enabled) {
      await this.manage.enable({ orgId, instanceId });
      return;
    }
    await this.manage.disable({ orgId, instanceId });
  }

  async remove(orgId: string, instanceId: string): Promise<void> {
    this.require(orgId, instanceId);
    await this.manage.delete({ orgId, instanceId });
  }

  async action(
    orgId: string,
    instanceId: string,
    actionId: string,
    input?: Record<string, unknown>,
  ): Promise<unknown> {
    const row = this.require(orgId, instanceId);
    const descriptor = this.requireDescriptor(orgId, row.addonId, row.triggerId);
    const action = descriptor.actions?.find((entry) => entry.id === actionId);
    if (action === undefined) {
      throw new AddonException(
        'invalid_params',
        422,
        `unknown action: ${actionId}; available: ${(descriptor.actions ?? [])
          .map((entry) => entry.id)
          .join(', ')}`,
      );
    }
    if (action.inputSchema !== undefined) {
      const issues = schemaValueIssues(input ?? {}, { ...action.inputSchema });
      if (issues.length > 0) {
        throw new AddonException(
          'invalid_params',
          422,
          `action input rejected: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
        );
      }
    }
    return this.calls.triggerAction(orgId, row.addonId, {
      instanceId,
      kind: row.triggerId,
      action: actionId,
      ...(input === undefined ? {} : { input }),
    });
  }

  scriptRuns(orgId: string, instanceId: string, limit: number) {
    const row = this.require(orgId, instanceId);
    return this.scriptRunList.execute({
      orgId,
      addonId: row.addonId,
      instanceId,
      limit,
    });
  }

  async testScript(orgId: string, instanceId: string, input: AutomationScriptTestInput) {
    const row = this.require(orgId, instanceId);
    const body = TriggerScriptTestRequestSchema.parse(input);
    return this.scriptTest.execute({
      orgId,
      addonId: row.addonId,
      instanceId,
      body,
    });
  }

  private require(orgId: string, instanceId: string): TriggerInstanceRow {
    const row = this.triggers.find(orgId, instanceId);
    if (row === null) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${instanceId}`);
    }
    return row;
  }

  private requireDescriptor(orgId: string, addonId: string, kind: string): TriggerDescriptor {
    const installed = this.orgAddons.find(orgId, addonId);
    if (installed === null || !installed.enabled) {
      throw new AddonException('not_found', 404, `Addon is not enabled: ${addonId}`);
    }
    const descriptor = this.findDescriptor(orgId, addonId, kind);
    if (descriptor === null) {
      throw new AddonException(
        'not_found',
        404,
        `Trigger kind is not declared: ${addonId}/${kind}`,
      );
    }
    return descriptor;
  }

  private findDescriptor(orgId: string, addonId: string, kind: string): TriggerDescriptor | null {
    const installed = this.orgAddons.find(orgId, addonId);
    if (installed === null) {
      return null;
    }
    return (
      this.descriptorsOf(addonId, installed.version).find((entry) => entry.kind === kind) ?? null
    );
  }

  private decorate(row: TriggerInstanceRow): AutomationInstance {
    const instance = toInstance(row);
    const descriptor = this.findDescriptor(row.orgId, row.addonId, row.triggerId);
    const actions = descriptor === null ? [] : actionsOf(descriptor);
    return actions.length === 0 ? instance : { ...instance, actions };
  }

  private assertConnection(orgId: string, addonId: string, descriptor: TriggerDescriptor): void {
    if (descriptor.connection === undefined) {
      return;
    }
    const accounts = this.bindings.accountsFor(orgId, addonId, descriptor.connection);
    if (accounts.length === 0) {
      throw new AddonException(
        'invalid_params',
        422,
        `trigger ${descriptor.kind} requires connection ${descriptor.connection}; connect the account first`,
      );
    }
  }

  private descriptorsOf(addonId: string, version: string): TriggerDescriptor[] {
    const pkg = this.catalog.find(addonId, version);
    if (!pkg) {
      return [];
    }
    const descriptors: TriggerDescriptor[] = [];
    for (const contribution of pkg.manifest.contributions) {
      if (contribution.family !== 'trigger') {
        continue;
      }
      const parsed = TriggerDescriptorSchema.safeParse(contribution.descriptor);
      if (parsed.success) {
        descriptors.push(parsed.data);
      }
    }
    return descriptors;
  }

  private addonTitleOf(addonId: string, version: string): string {
    const pkg = this.catalog.find(addonId, version);
    return pkg ? textOf(pkg.manifest.title, addonId) : addonId;
  }
}

function kindOf(
  addonId: string,
  addonTitle: string,
  descriptor: TriggerDescriptor,
): AutomationTriggerKind {
  const actions = actionsOf(descriptor);
  return {
    addonId,
    addonTitle,
    kind: descriptor.kind,
    title: textOf(descriptor.title, descriptor.kind),
    ...(descriptor.description === undefined
      ? {}
      : { description: textOf(descriptor.description, '') }),
    configFields: descriptor.configFields,
    ...(descriptor.connection === undefined ? {} : { connection: descriptor.connection }),
    ...(descriptor.standard === undefined ? {} : { standard: descriptor.standard }),
    ...(descriptor.limits === undefined ? {} : { limits: descriptor.limits }),
    ...(actions.length === 0 ? {} : { actions }),
  };
}

function actionsOf(descriptor: TriggerDescriptor): AutomationActionDescriptor[] {
  return (descriptor.actions ?? []).map((action) => ({
    id: action.id,
    title: textOf(action.title, action.id),
    ...(action.description === undefined ? {} : { description: textOf(action.description, '') }),
    ...(action.inputSchema === undefined ? {} : { inputSchema: { ...action.inputSchema } }),
  }));
}

function toInstance(row: TriggerInstanceRow): AutomationInstance {
  return {
    instanceId: row.id,
    addonId: row.addonId,
    kind: row.triggerId,
    label: row.label,
    enabled: row.enabled,
    instructions: row.instructions,
    config: parseObject(row.configJson) ?? {},
    target: parseObject(row.targetJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function textOf(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return resolveL10n(value, { locale: 'en' });
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return resolveL10n(value as L10n, { locale: 'en' });
  }
  return fallback;
}
