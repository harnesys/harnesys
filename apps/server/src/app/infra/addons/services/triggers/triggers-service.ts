import { Injectable } from '@harnesys/brix';
import type { JsonObject } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { ManageTriggerInstanceUseCase } from '../../../../application/addons/triggers/manage-instance.use-case.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { serviceMethod } from '../method.ts';
import { TriggerFireSink } from '../sinks.ts';

interface TriggerTargetParams {
  threadId: string;
  agentId: string;
  modeId?: string;
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
    params: { instanceId: string; runKey: string; text?: string; payload?: unknown },
  ): Promise<{ outcome: 'fired' | 'suppressed' | 'busy' | 'failed' }> {
    const row = this.instances.find(ctx.orgId, params.instanceId);
    if (!row || row.addonId !== ctx.addonId) {
      throw new AddonError('not_found', { detail: 'trigger instance not found for this add-on' });
    }
    const result = await this.sink.fire(ctx, {
      instanceId: params.instanceId,
      runKey: params.runKey,
      text: params.text,
      payload: params.payload,
    });
    return result;
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
      target: params.target,
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
      ...(params.target !== undefined ? { targetJson: JSON.stringify(params.target) } : {}),
      ...(params.instructions !== undefined ? { instructions: params.instructions } : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
    });
    return { instanceId: params.instanceId };
  }
}
