import type {
  ConnectorBindingInsert,
  ConnectorBindingRecord,
  ConnectorDeliveryInsert,
  ConnectorDeliveryRecord,
  ConnectorInboxInsert,
  ConnectorInboxRecord,
  ConnectorInboxStatus,
  ConnectorInsert,
  ConnectorPatch,
  ConnectorProvider,
  ConnectorRecord,
  ConnectorRouteInsert,
  ConnectorRouteRecord,
  InsertInboxResult,
} from './connector.ts';

export abstract class ConnectorRepositoryPort {
  abstract listByOrg(orgId: string): ConnectorRecord[];
  abstract findByAgentProvider(
    orgId: string,
    agentId: string,
    provider: ConnectorProvider,
  ): ConnectorRecord | undefined;
  abstract findByBotUser(orgId: string, botUserId: string): ConnectorRecord | undefined;
  abstract insert(rec: ConnectorInsert): ConnectorRecord;
  abstract update(orgId: string, id: string, patch: ConnectorPatch): ConnectorRecord;
  abstract delete(orgId: string, id: string): void;

  abstract insertBinding(rec: ConnectorBindingInsert): ConnectorBindingRecord;
  abstract findActiveBinding(
    orgId: string,
    connectorId: string,
  ): ConnectorBindingRecord | undefined;
  abstract clearBinding(orgId: string, connectorId: string, updatedAt: string): void;

  abstract insertRoute(orgId: string, rec: ConnectorRouteInsert): ConnectorRouteRecord;
  abstract deleteRoutesForConnector(orgId: string, connectorId: string): void;

  abstract insertInbox(orgId: string, rec: ConnectorInboxInsert): InsertInboxResult;
  abstract listPending(orgId: string, connectorId: string): ConnectorInboxRecord[];
  abstract markInbox(orgId: string, id: string, status: ConnectorInboxStatus): void;
  abstract updateInbox(
    orgId: string,
    id: string,
    patch: { status?: ConnectorInboxStatus; payload?: unknown },
  ): void;

  abstract upsertDelivery(orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord;
  abstract findDelivery(orgId: string, id: string): ConnectorDeliveryRecord | undefined;
  abstract listStreaming(orgId: string, connectorId: string): ConnectorDeliveryRecord[];
}
