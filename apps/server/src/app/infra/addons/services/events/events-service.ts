import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { EventBusPort } from '../../../../domain/events/event-bus.port.ts';
import { serviceMethod } from '../method.ts';

const MAX_PAYLOAD_BYTES = 64 * 1024;

@Injectable()
export class EventsHostService implements HostServiceModule {
  readonly namespace = 'events';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly bus: EventBusPort) {
    this.methods = [
      serviceMethod('events.emit', { timeoutMs: 5000 }, async (ctx, params) => {
        this.assertOwnNamespace(ctx, params.name);
        this.assertPayloadSize(params.payload);
        this.bus.publish(ctx.orgId, params.name, params.payload);
        return {};
      }),
    ];
  }

  private assertOwnNamespace(ctx: HostCallContext, name: string): void {
    if (!name.startsWith(`${ctx.addonId}.`)) {
      throw new AddonError('invalid_params', {
        detail: `event name must start with the add-on namespace '${ctx.addonId}.'`,
      });
    }
  }

  private assertPayloadSize(payload: unknown): void {
    const bytes = Buffer.byteLength(JSON.stringify(payload) ?? '');
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new AddonError('invalid_params', { detail: 'event payload exceeds 64 KiB' });
    }
  }
}
