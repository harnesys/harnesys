import type { InboundEvent } from '../provider-module.ts';

export interface InboundEnvelope {
  orgId: string;
  appId: string | null;
  accountId: string | null;
  kind: string;
  event: InboundEvent;
}

export abstract class InboundEventPort {
  abstract publish(orgId: string, envelope: InboundEnvelope): Promise<void>;
}
