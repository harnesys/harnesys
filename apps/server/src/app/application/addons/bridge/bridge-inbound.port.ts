import type { TransportMessage } from '@harnesys/sdk';

export interface BridgeInboundRequest {
  orgId: string;
  addonId: string;
  transportProvider: string;
  message: TransportMessage;
  correlationId?: string;
}

export type BridgeInboundOutcome = 'echo_suppressed' | 'dispatched' | 'auto_replied' | 'skipped';

export abstract class BridgeInboundPort {
  abstract execute(request: BridgeInboundRequest): Promise<BridgeInboundOutcome>;

  recordOutbound(orgId: string, addonId: string, messageId: string | undefined): void {
    void orgId;
    void addonId;
    void messageId;
  }
}
