import { Injectable } from '@harnesys/brix';
import type { WorkspaceRef } from '@harnesys/contracts';
import type {
  AddonTriggerScripts,
  AddonTriggerTarget,
  HostServiceResult,
  JsonObject,
} from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { ManageTriggerInstanceUseCase } from '../../../../application/addons/triggers/manage-instance.use-case.ts';
import { TriggerTargetSchema } from '../../../../application/addons/triggers/trigger-target.schema.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import type { TriggerInstanceRow } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { serviceMethod } from '../method.ts';
import { TriggerFireSink } from '../sinks.ts';

interface TriggerTargetParams {
  threadId: string;
  agentId: string;
  modeId?: string;
  workspace?: WorkspaceRef;
  scripts?: AddonTriggerScripts;
}

@Injectable()
export class TriggersHostService implements HostServiceModule {
  readonly namespace = 'triggers';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly instances: TriggerInstanceRepositoryPort,
    private readonly sink: TriggerFireSink,
    private readonly manage: ManageTriggerInstanceUseCase,
  ) {
    this.methods = [
      serviceMethod('triggers.fire', { timeoutMs: 10000 }, (ctx, params) => this.fire(ctx, params)),
      serviceMethod('triggers.get', { timeoutMs: 10000 }, (ctx, params) => this.get(ctx, params)),
      serviceMethod('triggers.create', { timeoutMs: 30000 }, (ctx, params) =>
        this.create(ctx, params),
      ),
      serviceMethod('triggers.update', { timeoutMs: 30000 }, (ctx, params) =>
        this.update(ctx, params),
      ),
    ];
  }

  private async fire(
    ctx: HostCallContext,
    params: {
      instanceId: string;
      runKey: string;
      text?: string;
      title?: string;
      fields?: Array<{ label: string; value: string; href?: string }>;
      payload?: unknown;
    },
  ): Promise<{ outcome: 'fired' | 'suppressed' | 'busy' | 'failed' | 'script-only' }> {
    const row = this.instances.find(ctx.orgId, params.instanceId);
    if (!row || row.addonId !== ctx.addonId) {
      throw new AddonError('not_found', { detail: 'trigger instance not found for this add-on' });
    }
    const result = await this.sink.fire(ctx, {
      instanceId: params.instanceId,
      runKey: params.runKey,
      ...(params.text === undefined ? {} : { text: params.text }),
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.fields === undefined ? {} : { fields: params.fields }),
      ...(params.payload === undefined ? {} : { payload: params.payload }),
    });
    return result;
  }

  private async get(
    ctx: HostCallContext,
    params: { instanceId: string },
  ): Promise<HostServiceResult<'triggers.get'>> {
    const row = this.owned(ctx, params.instanceId);
    return {
      instanceId: row.id,
      kind: row.triggerId,
      label: row.label,
      config: parseJsonObject(row.configJson),
      target: this.storedTarget(row.targetJson),
      instructions: row.instructions,
      enabled: row.enabled,
    };
  }

  private async create(
    ctx: HostCallContext,
    params: {
      kind: string;
      label: string;
      config: Record<string, unknown>;
      target: TriggerTargetParams;
      instructions?: string;
    },
  ): Promise<{ instanceId: string }> {
    const created = await this.manage.create({
      orgId: ctx.orgId,
      addonId: ctx.addonId,
      triggerId: params.kind,
      label: params.label,
      config: params.config as JsonObject,
      ...(params.instructions !== undefined ? { instructions: params.instructions } : {}),
      target: this.targetOf(params.target),
      enabled: true,
      actor: { kind: 'host', id: ctx.addonId },
      actorUserId: null,
    });
    return { instanceId: created.id };
  }

  private async update(
    ctx: HostCallContext,
    params: {
      instanceId: string;
      label?: string;
      config?: Record<string, unknown>;
      target?: TriggerTargetParams;
      instructions?: string;
      enabled?: boolean;
    },
  ): Promise<{ instanceId: string }> {
    const row = this.instances.find(ctx.orgId, params.instanceId);
    if (!row || row.addonId !== ctx.addonId) {
      throw new AddonError('not_found', { detail: 'trigger instance not found for this add-on' });
    }
    await this.manage.patch(ctx.orgId, params.instanceId, {
      ...(params.label !== undefined ? { label: params.label } : {}),
      ...(params.config !== undefined ? { configJson: JSON.stringify(params.config) } : {}),
      ...(params.target !== undefined
        ? { targetJson: JSON.stringify(this.mergedTarget(row, params.target)) }
        : {}),
      ...(params.instructions !== undefined ? { instructions: params.instructions } : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
    });
    return { instanceId: params.instanceId };
  }

  private storedTarget(targetJson: string): AddonTriggerTarget | null {
    const parsed = TriggerTargetSchema.safeParse(parseJson(targetJson));
    return parsed.success ? parsed.data : null;
  }

  private targetOf(target: TriggerTargetParams): TriggerTargetParams {
    return {
      threadId: target.threadId,
      agentId: target.agentId,
      ...(target.modeId === undefined ? {} : { modeId: target.modeId }),
      ...(target.workspace === undefined ? {} : { workspace: target.workspace }),
      ...(target.scripts === undefined ? {} : { scripts: target.scripts }),
    };
  }

  private mergedTarget(
    row: TriggerInstanceRow,
    target: TriggerTargetParams,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...this.targetOf(target) };
    if (merged.scripts === undefined) {
      const stored = storedScriptsOf(row.targetJson);
      if (stored !== undefined) {
        merged.scripts = stored;
      }
    }
    return merged;
  }

  private owned(ctx: HostCallContext, instanceId: string): TriggerInstanceRow {
    const row = this.instances.find(ctx.orgId, instanceId);
    if (!row || row.addonId !== ctx.addonId) {
      throw new AddonError('not_found', { detail: 'trigger instance not found for this add-on' });
    }
    return row;
  }
}

function storedScriptsOf(targetJson: string): unknown {
  const target = parseJson(targetJson);
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return undefined;
  }
  return (target as Record<string, unknown>).scripts;
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function parseJsonObject(json: string): Record<string, unknown> {
  const parsed = parseJson(json);
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
