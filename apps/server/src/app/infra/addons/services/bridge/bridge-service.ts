import { Injectable } from '@harnesys/brix';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { serviceMethod } from '../method.ts';
import { BridgeInboundSink } from '../sinks.ts';

@Injectable()
export class BridgeHostService implements HostServiceModule {
  readonly namespace = 'bridge';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly sink: BridgeInboundSink) {
    this.methods = [
      serviceMethod('bridge.inbound', { timeoutMs: 10000 }, (ctx, params) =>
        this.sink.inbound(ctx, params.message).then(() => ({})),
      ),
    ];
  }
}
