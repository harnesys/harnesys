import { and, asc, eq } from 'drizzle-orm';
import type {
  ConnectorInsert,
  ConnectorPatch,
  ConnectorProvider,
  ConnectorRecord,
} from '../../domain/connector/connector.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { connectorAgentsTable, connectorsTable } from '../org-sqlite/schema/index.ts';
import { mapConnectorSqliteError } from './connector-repository.errors.ts';
import {
  stringifyCapabilities,
  stringifyPolicy,
  toConnector,
} from './connector-repository.mappers.ts';

export function listConnectorsByOrg(db: OrgSqliteDb, orgId: string): ConnectorRecord[] {
  return db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.orgId, orgId))
    .all()
    .map(toConnector);
}

export function findConnectorById(
  db: OrgSqliteDb,
  orgId: string,
  id: string,
): ConnectorRecord | undefined {
  const row = db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.orgId, orgId), eq(connectorsTable.id, id)))
    .get();
  return row ? toConnector(row) : undefined;
}

export function findConnectorByAgentProvider(
  db: OrgSqliteDb,
  orgId: string,
  agentId: string,
  provider: ConnectorProvider,
): ConnectorRecord | undefined {
  const linked = db
    .select({ connectorId: connectorAgentsTable.connectorId })
    .from(connectorAgentsTable)
    .where(eq(connectorAgentsTable.agentId, agentId))
    .all();
  for (const link of linked) {
    const row = db
      .select()
      .from(connectorsTable)
      .where(
        and(
          eq(connectorsTable.orgId, orgId),
          eq(connectorsTable.id, link.connectorId),
          eq(connectorsTable.provider, provider),
        ),
      )
      .get();
    if (row) {
      return toConnector(row);
    }
  }
  return undefined;
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
        capabilities: stringifyCapabilities(rec.capabilities),
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
      throw mapConnectorSqliteError(new Error(`connector not found: ${id}`));
    }
    return toConnector(row);
  } catch (err) {
    throw mapConnectorSqliteError(err);
  }
}

export function deleteConnector(db: OrgSqliteDb, orgId: string, id: string): void {
  db.delete(connectorsTable)
    .where(and(eq(connectorsTable.orgId, orgId), eq(connectorsTable.id, id)))
    .run();
}

export function listConnectorAgentIds(db: OrgSqliteDb, connectorId: string): string[] {
  return db
    .select({ agentId: connectorAgentsTable.agentId })
    .from(connectorAgentsTable)
    .where(eq(connectorAgentsTable.connectorId, connectorId))
    .orderBy(asc(connectorAgentsTable.createdAt))
    .all()
    .map((row) => row.agentId);
}

export function ensureConnectorAgent(
  db: OrgSqliteDb,
  connectorId: string,
  agentId: string,
  createdAt: string,
): void {
  db.insert(connectorAgentsTable)
    .values({ connectorId, agentId, createdAt })
    .onConflictDoNothing()
    .run();
}

export function replaceConnectorAgents(
  db: OrgSqliteDb,
  connectorId: string,
  agentIds: string[],
  createdAt: string,
): void {
  db.transaction((tx) => {
    tx.delete(connectorAgentsTable).where(eq(connectorAgentsTable.connectorId, connectorId)).run();
    for (const agentId of agentIds) {
      tx.insert(connectorAgentsTable)
        .values({ connectorId, agentId, createdAt })
        .onConflictDoNothing()
        .run();
    }
  });
}

export function removeConnectorAgent(db: OrgSqliteDb, connectorId: string, agentId: string): void {
  db.delete(connectorAgentsTable)
    .where(
      and(
        eq(connectorAgentsTable.connectorId, connectorId),
        eq(connectorAgentsTable.agentId, agentId),
      ),
    )
    .run();
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
  if (patch.capabilities !== undefined) {
    values.capabilities = stringifyCapabilities(patch.capabilities);
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
