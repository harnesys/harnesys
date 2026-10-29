import { and, eq } from 'drizzle-orm';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type {
  ConnectorBindingInsert,
  ConnectorBindingRecord,
  ConnectorInsert,
  ConnectorPatch,
  ConnectorProvider,
  ConnectorRecord,
  ConnectorRouteInsert,
  ConnectorRouteRecord,
} from '../../domain/connector/connector.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  connectorBindingsTable,
  connectorRoutesTable,
  connectorsTable,
} from '../org-sqlite/schema/index.ts';
import { mapConnectorSqliteError } from './connector-repository.errors.ts';
import {
  stringifyParticipant,
  stringifyPolicy,
  toBinding,
  toConnector,
  topicToStorage,
  toRoute,
} from './connector-repository.mappers.ts';

export function listConnectorsByOrg(db: OrgSqliteDb, orgId: string): ConnectorRecord[] {
  return db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.orgId, orgId))
    .all()
    .map(toConnector);
}

export function findConnectorByAgentProvider(
  db: OrgSqliteDb,
  orgId: string,
  agentId: string,
  provider: ConnectorProvider,
): ConnectorRecord | undefined {
  const row = db
    .select()
    .from(connectorsTable)
    .where(
      and(
        eq(connectorsTable.orgId, orgId),
        eq(connectorsTable.agentId, agentId),
        eq(connectorsTable.provider, provider),
      ),
    )
    .get();
  return row ? toConnector(row) : undefined;
}

export function findConnectorByBotUser(
  db: OrgSqliteDb,
  orgId: string,
  botUserId: string,
): ConnectorRecord | undefined {
  if (botUserId === '') {
    return undefined;
  }
  const row = db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.orgId, orgId), eq(connectorsTable.botUserId, botUserId)))
    .get();
  return row ? toConnector(row) : undefined;
}

export function insertConnector(db: OrgSqliteDb, rec: ConnectorInsert): ConnectorRecord {
  try {
    const row = db
      .insert(connectorsTable)
      .values({
        id: rec.id,
        orgId: rec.orgId,
        agentId: rec.agentId,
        provider: rec.provider,
        secretRef: rec.secretRef,
        status: rec.status,
        botUserId: rec.botUserId,
        botUsername: rec.botUsername,
        pairCodeHash: rec.pairCodeHash,
        pairCodeExpiresAt: rec.pairCodeExpiresAt,
        leaseOwner: rec.leaseOwner,
        leaseUntil: rec.leaseUntil,
        streamMode: rec.streamMode,
        policy: stringifyPolicy(rec.policy),
        modeOverride: rec.modeOverride,
        lastError: rec.lastError,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      })
      .returning()
      .get();
    return toConnector(row);
  } catch (err) {
    throw mapConnectorSqliteError(err);
  }
}

export function updateConnector(
  db: OrgSqliteDb,
  orgId: string,
  id: string,
  patch: ConnectorPatch,
): ConnectorRecord {
  try {
    const values = connectorPatchValues(patch);
    const row = db
      .update(connectorsTable)
      .set(values)
      .where(and(eq(connectorsTable.orgId, orgId), eq(connectorsTable.id, id)))
      .returning()
      .get();
    if (!row) {
      throw new ConnectorNotFoundException(id);
    }
    return toConnector(row);
  } catch (err) {
    if (err instanceof ConnectorNotFoundException) {
      throw err;
    }
    throw mapConnectorSqliteError(err);
  }
}

export function deleteConnector(db: OrgSqliteDb, orgId: string, id: string): void {
  db.delete(connectorsTable)
    .where(and(eq(connectorsTable.orgId, orgId), eq(connectorsTable.id, id)))
    .run();
}

export function insertBinding(
  db: OrgSqliteDb,
  rec: ConnectorBindingInsert,
): ConnectorBindingRecord {
  try {
    const row = db
      .insert(connectorBindingsTable)
      .values({
        id: rec.id,
        connectorId: rec.connectorId,
        orgId: rec.orgId,
        externalChatId: rec.externalChatId,
        externalTopicId: topicToStorage(rec.externalTopicId),
        chatType: rec.chatType,
        threadId: rec.threadId,
        participantPolicy: stringifyParticipant(rec.participantPolicy),
        status: rec.status,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      })
      .returning()
      .get();
    return toBinding(row);
  } catch (err) {
    throw mapConnectorSqliteError(err);
  }
}

export function findActiveBinding(
  db: OrgSqliteDb,
  orgId: string,
  connectorId: string,
): ConnectorBindingRecord | undefined {
  const row = db
    .select()
    .from(connectorBindingsTable)
    .where(
      and(
        eq(connectorBindingsTable.orgId, orgId),
        eq(connectorBindingsTable.connectorId, connectorId),
        eq(connectorBindingsTable.status, 'active'),
      ),
    )
    .get();
  return row ? toBinding(row) : undefined;
}

export function clearBinding(
  db: OrgSqliteDb,
  orgId: string,
  connectorId: string,
  updatedAt: string,
): void {
  db.update(connectorBindingsTable)
    .set({
      status: 'unpaired',
      externalChatId: '',
      externalTopicId: '',
      participantPolicy: '{}',
      updatedAt,
    })
    .where(
      and(
        eq(connectorBindingsTable.orgId, orgId),
        eq(connectorBindingsTable.connectorId, connectorId),
        eq(connectorBindingsTable.status, 'active'),
      ),
    )
    .run();
}

export function insertRoute(db: OrgSqliteDb, rec: ConnectorRouteInsert): ConnectorRouteRecord {
  try {
    const row = db
      .insert(connectorRoutesTable)
      .values({
        id: rec.id,
        connectorId: rec.connectorId,
        bindingId: rec.bindingId,
        scope: rec.scope,
        threadId: rec.threadId,
        createdAt: rec.createdAt,
      })
      .returning()
      .get();
    return toRoute(row);
  } catch (err) {
    throw mapConnectorSqliteError(err);
  }
}

export function deleteRoutesForConnector(db: OrgSqliteDb, connectorId: string): void {
  db.delete(connectorRoutesTable).where(eq(connectorRoutesTable.connectorId, connectorId)).run();
}

function connectorPatchValues(patch: ConnectorPatch): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (patch.secretRef !== undefined) {
    values.secretRef = patch.secretRef;
  }
  if (patch.status !== undefined) {
    values.status = patch.status;
  }
  if (patch.botUserId !== undefined) {
    values.botUserId = patch.botUserId;
  }
  if (patch.botUsername !== undefined) {
    values.botUsername = patch.botUsername;
  }
  if (patch.pairCodeHash !== undefined) {
    values.pairCodeHash = patch.pairCodeHash;
  }
  if (patch.pairCodeExpiresAt !== undefined) {
    values.pairCodeExpiresAt = patch.pairCodeExpiresAt;
  }
  if (patch.leaseOwner !== undefined) {
    values.leaseOwner = patch.leaseOwner;
  }
  if (patch.leaseUntil !== undefined) {
    values.leaseUntil = patch.leaseUntil;
  }
  if (patch.streamMode !== undefined) {
    values.streamMode = patch.streamMode;
  }
  if (patch.policy !== undefined) {
    values.policy = stringifyPolicy(patch.policy);
  }
  if (patch.modeOverride !== undefined) {
    values.modeOverride = patch.modeOverride;
  }
  if (patch.lastError !== undefined) {
    values.lastError = patch.lastError;
  }
  if (patch.updatedAt !== undefined) {
    values.updatedAt = patch.updatedAt;
  }
  return values;
}
