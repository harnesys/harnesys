import { Injectable } from '@harnesys/brix';
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
} from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  findDelivery as findDeliveryRow,
  insertInbox as insertInboxRow,
  listPendingInbox,
  listStreamingDeliveries,
  markInbox as markInboxRow,
  updateInbox as updateInboxRow,
  upsertDelivery as upsertDeliveryRow,
} from './connector-repository.inbox.ts';
import {
  clearBinding as clearBindingRow,
  deleteConnector,
  deleteRoutesForConnector as deleteRoutes,
  findActiveBinding as findActiveBindingRow,
  findConnectorByAgentProvider,
  findConnectorByBotUser,
  insertBinding as insertBindingRow,
  insertConnector,
  insertRoute as insertRouteRow,
  listConnectorsByOrg,
  updateConnector,
} from './connector-repository.store.ts';

@Injectable()
export class ConnectorRepositoryAdapter extends ConnectorRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): ConnectorRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listConnectorsByOrg(db, orgId));
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
    return withOrgSqlite(this.layout, rec.orgId, (db) => insertConnector(db, rec));
  }

  update(orgId: string, id: string, patch: ConnectorPatch): ConnectorRecord {
    return withOrgSqlite(this.layout, orgId, (db) => updateConnector(db, orgId, id, patch));
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      deleteConnector(db, orgId, id);
    });
  }

  insertBinding(rec: ConnectorBindingInsert): ConnectorBindingRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => insertBindingRow(db, rec));
  }

  findActiveBinding(orgId: string, connectorId: string): ConnectorBindingRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findActiveBindingRow(db, orgId, connectorId));
  }

  clearBinding(orgId: string, connectorId: string, updatedAt: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      clearBindingRow(db, orgId, connectorId, updatedAt);
    });
  }

  insertRoute(orgId: string, rec: ConnectorRouteInsert): ConnectorRouteRecord {
    return withOrgSqlite(this.layout, orgId, (db) => insertRouteRow(db, rec));
  }

  deleteRoutesForConnector(orgId: string, connectorId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      deleteRoutes(db, connectorId);
    });
  }

  insertInbox(orgId: string, rec: ConnectorInboxInsert): InsertInboxResult {
    return withOrgSqlite(this.layout, orgId, (db) => insertInboxRow(db, rec));
  }

  listPending(orgId: string, connectorId: string): ConnectorInboxRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listPendingInbox(db, connectorId));
  }

  markInbox(orgId: string, id: string, status: ConnectorInboxStatus): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      markInboxRow(db, id, status);
    });
  }

  updateInbox(
    orgId: string,
    id: string,
    patch: { status?: ConnectorInboxStatus; payload?: unknown },
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      updateInboxRow(db, id, patch);
    });
  }

  upsertDelivery(orgId: string, rec: ConnectorDeliveryInsert): ConnectorDeliveryRecord {
    return withOrgSqlite(this.layout, orgId, (db) => upsertDeliveryRow(db, rec));
  }

  findDelivery(orgId: string, id: string): ConnectorDeliveryRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => findDeliveryRow(db, id));
  }

  listStreaming(orgId: string, connectorId: string): ConnectorDeliveryRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listStreamingDeliveries(db, connectorId));
  }
}
