export interface HostEventEnvelope {
  name: string;
  version: number;
  orgId: string;
  occurredAt: string;
  payload: unknown;
}

export interface HostEventSubscription {
  close(): void;
}

export type HostEventHandler = (envelope: HostEventEnvelope) => void;

export abstract class EventBusPort {
  abstract publish(orgId: string, name: string, payload: unknown): void;

  abstract subscribe(
    orgId: string,
    patterns: readonly string[],
    handler: HostEventHandler,
  ): HostEventSubscription;
}
