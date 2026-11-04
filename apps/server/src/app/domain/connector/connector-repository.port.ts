import type {
  ConnectorBindingInsert,
  ConnectorBindingRecord,
  ConnectorDeliveryInsert,
  ConnectorDeliveryRecord,
  ConnectorInboxInsert,
  ConnectorInboxStatus,
  ConnectorInsert,
  ConnectorPatch,
  ConnectorProvider,
  ConnectorRecord,
  InsertInboxResult,
} from './connector.ts';

export abstract class ConnectorRepositoryPort {
  abstract listByOrg(orgId: string): ConnectorRecord[];
  abstract findById(orgId: string, id: string): ConnectorRecord | undefined;
  abstract findByAgentProvider(
    orgId: string,
    agentId: string,
    provider: ConnectorProvider,
  ): ConnectorRecord | undefined;
  abstract findByBotUser(orgId: string, botUserId: string): ConnectorRecord | undefined;
  abstract insert(rec: ConnectorInsert): ConnectorRecord;
  abstract update(orgId: string, id: string, patch: ConnectorPatch): ConnectorRecord;
  abstract delete(orgId: string, id: string): void;

  abstract listAgentIds(orgId: string, connectorId: string): string[];
  abstract ensureAgent(orgId: string, connectorId: string, agentId: string): void;
  abstract removeAgent(orgId: string, connectorId: string, agentId: string): void;
  abstract replaceAgents(orgId: string, connectorId: string, agentIds: string[]): void;

  abstract insertBinding(rec: ConnectorBindingInsert): ConnectorBindingRecord;
  abstract findActiveBinding(
    orgId: string,
    connectorId: string,
  ): ConnectorBindingRecord | undefined;
  abstract findBinding(orgId: string, connectorId: string, id: string): ConnectorBindingRecord;
  abstract findBindingByChat(
    orgId: string,
    connectorId: string,
    externalChatId: string,
    externalTopicId: string | null,
  ): ConnectorBindingRecord | undefined;
  abstract findBindingForThread(
    orgId: string,
    connectorId: string,
    threadId: string,
  ): ConnectorBindingRecord | undefined;
  abstract listBindings(orgId: string, connectorId: string): ConnectorBindingRecord[];
  abstract listBindingsByThread(orgId: string, threadId: string): ConnectorBindingRecord[];
  abstract updateBindingTitle(
    orgId: string,
    bindingId: string,
    title: string,
    updatedAt: string,
  ): void;
  abstract deleteBinding(orgId: string, bindingId: string): void;
  abstract attachBindingThread(
    orgId: string,
    bindingId: string,
    threadId: string,
    updatedAt: string,
  ): ConnectorBindingRecord;
  abstract detachBinding(orgId: string, bindingId: string, updatedAt: string): void;
  abstract clearBindings(orgId: string, connectorId: string): void;

  abstract insertInbox(orgId: string, rec: ConnectorInboxInsert): InsertInboxResult;
  abstract markInbox(orgId: string, id: string, status: ConnectorInboxStatus): void;

  abstract upsertDelivery(orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord;
  abstract findDelivery(orgId: string, id: string): ConnectorDeliveryRecord | undefined;
  abstract findDeliveryByMessage(
    orgId: string,
    connectorId: string,
    externalMessageId: string,
  ): ConnectorDeliveryRecord | undefined;
  abstract listStreaming(orgId: string, connectorId: string): ConnectorDeliveryRecord[];
}
