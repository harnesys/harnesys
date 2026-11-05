import { Injectable } from '@harnesys/brix';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
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
  InsertInboxResult,
} from '../../domain/connector/connector.ts';
import { ConnectorEventsPort } from '../../domain/connector/connector-events.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  attachBindingThread as attachBindingThreadRow,
  clearBindings as clearBindingsRow,
  deleteBinding as deleteBindingRow,
  detachBinding as detachBindingRow,
  findActiveBinding as findActiveBindingRow,
  findBindingByChat as findBindingByChatRow,
  findBindingById as findBindingByIdRow,
  findBindingForThread as findBindingForThreadRow,
  insertBinding as insertBindingRow,
  listBindingsByThread as listBindingsByThreadRow,
  listBindings as listBindingsRow,
  updateBindingTitle as updateBindingTitleRow,
} from './connector-repository.bindings.ts';
import {
  findDeliveryByMessage as findDeliveryByMessageRow,
  findDelivery as findDeliveryRow,
  insertInbox as insertInboxRow,
  listRecentInbox as listRecentInboxRow,
  listStreamingDeliveries,
  markInbox as markInboxRow,
  upsertDelivery as upsertDeliveryRow,
} from './connector-repository.inbox.ts';
import {
  deleteConnector,
  ensureConnectorAgent,
  findConnectorByAgentProvider,
  findConnectorByBotUser,
  findConnectorById,
  insertConnector,
  listConnectorAgentIds,
  listConnectorsByOrg,
  removeConnectorAgent,
  replaceConnectorAgents,
  updateConnector,
} from './connector-repository.store.ts';

@Injectable()
export class ConnectorRepositoryAdapter extends ConnectorRepositoryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly events: ConnectorEventsPort,
  ) {
    super();
  }

  listByOrg(orgId: string): ConnectorRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listConnectorsByOrg(db, orgId));
  }

  findById(orgId: string, id: string): ConnectorRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findConnectorById(db, orgId, id));
  }

  findByAgentProvider(
    orgId: string,
    agentId: string,
    provider: ConnectorProvider,
  ): ConnectorRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) =>
      findConnectorByAgentProvider(db, orgId, agentId, provider),
    );
  }

  findByBotUser(orgId: string, botUserId: string): ConnectorRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findConnectorByBotUser(db, orgId, botUserId));
  }

  insert(rec: ConnectorInsert): ConnectorRecord {
    const created = withOrgSqlite(this.layout, rec.orgId, (db) => insertConnector(db, rec));
    this.events.emit(rec.orgId);
    return created;
  }

  update(orgId: string, id: string, patch: ConnectorPatch): ConnectorRecord {
    const updated = withOrgSqlite(this.layout, orgId, (db) =>
      updateConnector(db, orgId, id, patch),
    );
    if (touchesConnectorView(patch)) {
      this.events.emit(orgId);
    }
    return updated;
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      deleteConnector(db, orgId, id);
    });
    this.events.emit(orgId);
  }

  listAgentIds(orgId: string, connectorId: string): string[] {
    return withOrgSqlite(this.layout, orgId, (db) => listConnectorAgentIds(db, connectorId));
  }

  ensureAgent(orgId: string, connectorId: string, agentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      ensureConnectorAgent(db, connectorId, agentId, new Date().toISOString());
    });
  }

  removeAgent(orgId: string, connectorId: string, agentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      removeConnectorAgent(db, connectorId, agentId);
    });
  }

  replaceAgents(orgId: string, connectorId: string, agentIds: string[]): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      replaceConnectorAgents(db, connectorId, agentIds, new Date().toISOString());
    });
  }

  insertBinding(rec: ConnectorBindingInsert): ConnectorBindingRecord {
    const created = withOrgSqlite(this.layout, rec.orgId, (db) => insertBindingRow(db, rec));
    this.events.emit(rec.orgId);
    return created;
  }

  findActiveBinding(orgId: string, connectorId: string): ConnectorBindingRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findActiveBindingRow(db, orgId, connectorId));
  }

  findBinding(orgId: string, connectorId: string, id: string): ConnectorBindingRecord {
    const found = withOrgSqlite(this.layout, orgId, (db) =>
      findBindingByIdRow(db, orgId, connectorId, id),
    );
    if (!found) {
      throw new ConnectorNotFoundException(id);
    }
    return found;
  }

  findBindingByChat(
    orgId: string,
    connectorId: string,
    externalChatId: string,
    externalTopicId: string | null,
  ): ConnectorBindingRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) =>
      findBindingByChatRow(db, connectorId, externalChatId, externalTopicId),
    );
  }

  findBindingForThread(
    orgId: string,
    connectorId: string,
    threadId: string,
  ): ConnectorBindingRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) =>
      findBindingForThreadRow(db, connectorId, threadId),
    );
  }

  listBindings(orgId: string, connectorId: string): ConnectorBindingRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listBindingsRow(db, connectorId));
  }

  listBindingsByThread(orgId: string, threadId: string): ConnectorBindingRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listBindingsByThreadRow(db, orgId, threadId));
  }

  updateBindingTitle(orgId: string, bindingId: string, title: string, updatedAt: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      updateBindingTitleRow(db, orgId, bindingId, title, updatedAt);
    });
    this.events.emit(orgId);
  }

  deleteBinding(orgId: string, bindingId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      deleteBindingRow(db, orgId, bindingId);
    });
    this.events.emit(orgId);
  }

  attachBindingThread(
    orgId: string,
    bindingId: string,
    threadId: string,
    updatedAt: string,
  ): ConnectorBindingRecord {
    const bound = withOrgSqlite(this.layout, orgId, (db) =>
      attachBindingThreadRow(db, orgId, bindingId, threadId, updatedAt),
    );
    this.events.emit(orgId);
    return bound;
  }

  detachBinding(orgId: string, bindingId: string, updatedAt: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      detachBindingRow(db, orgId, bindingId, updatedAt);
    });
    this.events.emit(orgId);
  }

  clearBindings(orgId: string, connectorId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      clearBindingsRow(db, connectorId);
    });
    this.events.emit(orgId);
  }

  insertInbox(orgId: string, rec: ConnectorInboxInsert): InsertInboxResult {
    return withOrgSqlite(this.layout, orgId, (db) => insertInboxRow(db, rec));
  }

  markInbox(orgId: string, id: string, status: ConnectorInboxStatus): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      markInboxRow(db, id, status);
    });
  }

  listRecentInbox(
    orgId: string,
    connectorId: string,
    externalChatId: string,
    externalTopicId: string | null,
    limit: number,
  ): ConnectorInboxRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      listRecentInboxRow(db, connectorId, externalChatId, externalTopicId, limit),
    );
  }

  upsertDelivery(orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord {
    return withOrgSqlite(this.layout, orgId, (db) => upsertDeliveryRow(db, rec));
  }

  findDelivery(orgId: string, id: string): ConnectorDeliveryRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findDeliveryRow(db, id));
  }

  findDeliveryByMessage(
    orgId: string,
    connectorId: string,
    externalMessageId: string,
  ): ConnectorDeliveryRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) =>
      findDeliveryByMessageRow(db, connectorId, externalMessageId),
    );
  }

  listStreaming(orgId: string, connectorId: string): ConnectorDeliveryRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listStreamingDeliveries(db, connectorId));
  }
}

const VIEW_FIELDS = new Set<keyof ConnectorPatch>([
  'status',
  'lastError',
  'pairCodeHash',
  'pairCodeExpiresAt',
  'botUsername',
  'botUserId',
  'policy',
  'capabilities',
]);

function touchesConnectorView(patch: ConnectorPatch): boolean {
  return (Object.keys(patch) as Array<keyof ConnectorPatch>).some((key) => VIEW_FIELDS.has(key));
}
