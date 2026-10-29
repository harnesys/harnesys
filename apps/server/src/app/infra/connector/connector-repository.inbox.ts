import { and, eq } from 'drizzle-orm';
import type {
  ConnectorDeliveryInsert,
  ConnectorDeliveryRecord,
  ConnectorInboxInsert,
  ConnectorInboxRecord,
  ConnectorInboxStatus,
  InsertInboxResult,
} from '../../domain/connector/connector.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { connectorDeliveriesTable, connectorInboxTable } from '../org-sqlite/schema/index.ts';
import { mapConnectorSqliteError } from './connector-repository.errors.ts';
import { stringifyPayload, toDelivery, toInbox } from './connector-repository.mappers.ts';

export function insertInbox(db: OrgSqliteDb, rec: ConnectorInboxInsert): InsertInboxResult {
  try {
    db.insert(connectorInboxTable)
      .values({
        id: rec.id,
        connectorId: rec.connectorId,
        bindingId: rec.bindingId,
        updateId: rec.updateId,
        kind: rec.kind,
        payload: stringifyPayload(rec.payload),
        status: rec.status,
        createdAt: rec.createdAt,
      })
      .run();
    return 'inserted';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE') && message.includes('connector_inbox')) {
      return 'duplicate';
    }
    throw mapConnectorSqliteError(err);
  }
}

export function listPendingInbox(db: OrgSqliteDb, connectorId: string): ConnectorInboxRecord[] {
  return db
    .select()
    .from(connectorInboxTable)
    .where(
      and(
        eq(connectorInboxTable.connectorId, connectorId),
        eq(connectorInboxTable.status, 'pending'),
      ),
    )
    .all()
    .map(toInbox);
}

export function markInbox(db: OrgSqliteDb, id: string, status: ConnectorInboxStatus): void {
  db.update(connectorInboxTable).set({ status }).where(eq(connectorInboxTable.id, id)).run();
}

export function updateInbox(
  db: OrgSqliteDb,
  id: string,
  patch: { status?: ConnectorInboxStatus; payload?: unknown },
): void {
  const set: { status?: ConnectorInboxStatus; payload?: string } = {};
  if (patch.status !== undefined) {
    set.status = patch.status;
  }
  if (patch.payload !== undefined) {
    set.payload = stringifyPayload(patch.payload);
  }
  if (set.status === undefined && set.payload === undefined) {
    return;
  }
  db.update(connectorInboxTable).set(set).where(eq(connectorInboxTable.id, id)).run();
}

export function upsertDelivery(
  db: OrgSqliteDb,
  rec: ConnectorDeliveryInsert,
): ConnectorDeliveryRecord {
  try {
    const values = {
      id: rec.id,
      connectorId: rec.connectorId,
      bindingId: rec.bindingId,
      threadId: rec.threadId,
      runId: rec.runId,
      blockKey: rec.blockKey,
      interruptId: rec.interruptId,
      draftId: rec.draftId,
      lastText: rec.lastText,
      externalMessageId: rec.externalMessageId,
      status: rec.status,
      updatedAt: rec.updatedAt,
    };
    const row = db
      .insert(connectorDeliveriesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          connectorDeliveriesTable.connectorId,
          connectorDeliveriesTable.runId,
          connectorDeliveriesTable.blockKey,
        ],
        set: {
          interruptId: values.interruptId,
          draftId: values.draftId,
          lastText: values.lastText,
          externalMessageId: values.externalMessageId,
          status: values.status,
          updatedAt: values.updatedAt,
        },
      })
      .returning()
      .get();
    return toDelivery(row);
  } catch (err) {
    throw mapConnectorSqliteError(err);
  }
}

export function findDelivery(db: OrgSqliteDb, id: string): ConnectorDeliveryRecord | undefined {
  const row = db
    .select()
    .from(connectorDeliveriesTable)
    .where(eq(connectorDeliveriesTable.id, id))
    .get();
  return row ? toDelivery(row) : undefined;
}

export function listStreamingDeliveries(
  db: OrgSqliteDb,
  connectorId: string,
): ConnectorDeliveryRecord[] {
  return db
    .select()
    .from(connectorDeliveriesTable)
    .where(
      and(
        eq(connectorDeliveriesTable.connectorId, connectorId),
        eq(connectorDeliveriesTable.status, 'streaming'),
      ),
    )
    .all()
    .map(toDelivery);
}
