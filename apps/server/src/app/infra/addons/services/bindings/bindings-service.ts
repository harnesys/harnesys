import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { AddonTransportBindingRepositoryPort } from '../../../../domain/addons/ports/transport-binding-repository.port.ts';
import { serviceMethod } from '../method.ts';

@Injectable()
export class BindingsHostService implements HostServiceModule {
  readonly namespace = 'bindings';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly bindings: AddonTransportBindingRepositoryPort) {
    this.methods = [
      serviceMethod('bindings.channels', undefined, (ctx, params) =>
        this.channels(ctx, params.provider),
      ),
    ];
  }

  private async channels(
    ctx: HostCallContext,
    provider: string | undefined,
  ): Promise<{
    channels: Array<{ provider: string; channel: string; threadId: string; createdAt: string }>;
  }> {
    const rows = this.bindings.listByAddon(ctx.orgId, ctx.addonId);
    const channels = rows
      .filter((row) => provider === undefined || row.provider === provider)
      .map((row) => ({
        provider: row.provider,
        channel: row.externalChatId,
        threadId: row.threadId,
        createdAt: row.createdAt,
      }));
    return { channels };
  }
}
