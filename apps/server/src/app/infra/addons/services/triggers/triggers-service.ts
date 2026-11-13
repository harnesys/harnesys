import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { serviceMethod } from '../method.ts';
import { TriggerFireSink } from '../sinks.ts';

@Injectable()
export class TriggersHostService implements HostServiceModule {
  readonly namespace = 'triggers';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly instances: TriggerInstanceRepositoryPort,
    private readonly sink: TriggerFireSink,
  ) {
    this.methods = [
      serviceMethod('triggers.fire', { timeoutMs: 10000 }, (ctx, params) => this.fire(ctx, params)),
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
}
