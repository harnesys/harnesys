export interface IntegrationEventRecord {
  id: string;
  orgId: string;
  integrationId: string;
  deliveryId: string;
  eventType: string;
  payloadJson: string;
  createdAt: string;
}

export type IntegrationEventAppendResult = 'stored' | 'duplicate';

export interface AppendIntegrationEventInput {
  orgId: string;
  integrationId: string;
  deliveryId: string;
  eventType: string;
  payloadJson: string;
}

export abstract class IntegrationEventsPort {
  abstract append(input: AppendIntegrationEventInput): IntegrationEventAppendResult;
  abstract listRecent(
    orgId: string,
    integrationId: string,
    limit: number,
  ): IntegrationEventRecord[];
}
