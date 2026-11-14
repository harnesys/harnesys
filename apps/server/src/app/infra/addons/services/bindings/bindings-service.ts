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
      serviceMethod('bindings.bind', undefined, (ctx, params) => this.bind(ctx, params)),
      serviceMethod('bindings.unbind', undefined, (ctx, params) => this.unbind(ctx, params)),
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

  private async bind(
    ctx: HostCallContext,
    params: { provider: string; channel: string; threadId: string },
  ): Promise<{ ok: true }> {
    this.bindings.remove(ctx.orgId, ctx.addonId, params.provider, params.channel);
    this.bindings.add({
      orgId: ctx.orgId,
      addonId: ctx.addonId,
      provider: params.provider,
      externalChatId: params.channel,
      threadId: params.threadId,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  private async unbind(
    ctx: HostCallContext,
    params: { provider: string; channel: string },
  ): Promise<{ ok: true }> {
    this.bindings.remove(ctx.orgId, ctx.addonId, params.provider, params.channel);
    return { ok: true };
  }
}
