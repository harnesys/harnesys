import { and, asc, eq } from 'drizzle-orm';
import type {
  ConnectorBindingInsert,
  ConnectorBindingRecord,
} from '../../domain/connector/connector.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { connectorBindingsTable } from '../org-sqlite/schema/index.ts';
import { mapConnectorSqliteError } from './connector-repository.errors.ts';
import { toBinding, topicToStorage } from './connector-repository.mappers.ts';

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
        title: rec.title ?? '',
        threadId: rec.threadId,
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

export function findBindingById(
  db: OrgSqliteDb,
  orgId: string,
  connectorId: string,
  id: string,
): ConnectorBindingRecord | undefined {
  const row = db
    .select()
    .from(connectorBindingsTable)
    .where(
      and(
        eq(connectorBindingsTable.orgId, orgId),
        eq(connectorBindingsTable.connectorId, connectorId),
        eq(connectorBindingsTable.id, id),
      ),
    )
    .get();
  return row ? toBinding(row) : undefined;
}

export function findBindingByChat(
  db: OrgSqliteDb,
  connectorId: string,
  externalChatId: string,
  externalTopicId: string | null,
): ConnectorBindingRecord | undefined {
  const row = db
    .select()
    .from(connectorBindingsTable)
    .where(
      and(
        eq(connectorBindingsTable.connectorId, connectorId),
        eq(connectorBindingsTable.externalChatId, externalChatId),
        eq(connectorBindingsTable.externalTopicId, topicToStorage(externalTopicId)),
      ),
    )
    .get();
  return row ? toBinding(row) : undefined;
}

export function findBindingForThread(
  db: OrgSqliteDb,
  connectorId: string,
  threadId: string,
): ConnectorBindingRecord | undefined {
  const row = db
    .select()
    .from(connectorBindingsTable)
    .where(
      and(
        eq(connectorBindingsTable.connectorId, connectorId),
        eq(connectorBindingsTable.threadId, threadId),
      ),
    )
    .get();
  return row ? toBinding(row) : undefined;
}

export function listBindingsByThread(
  db: OrgSqliteDb,
  orgId: string,
  threadId: string,
): ConnectorBindingRecord[] {
  return db
    .select()
    .from(connectorBindingsTable)
    .where(
      and(eq(connectorBindingsTable.orgId, orgId), eq(connectorBindingsTable.threadId, threadId)),
    )
    .orderBy(asc(connectorBindingsTable.createdAt))
    .all()
    .map(toBinding);
}

export function listBindings(db: OrgSqliteDb, connectorId: string): ConnectorBindingRecord[] {
  return db
    .select()
    .from(connectorBindingsTable)
    .where(eq(connectorBindingsTable.connectorId, connectorId))
    .orderBy(asc(connectorBindingsTable.createdAt))
    .all()
    .map(toBinding);
}

export function attachBindingThread(
  db: OrgSqliteDb,
  orgId: string,
  bindingId: string,
  threadId: string,
  updatedAt: string,
): ConnectorBindingRecord {
  const row = db
    .update(connectorBindingsTable)
    .set({ threadId, status: 'active', updatedAt })
    .where(and(eq(connectorBindingsTable.orgId, orgId), eq(connectorBindingsTable.id, bindingId)))
    .returning()
    .get();
  if (!row) {
    throw mapConnectorSqliteError(new Error(`binding not found: ${bindingId}`));
  }
  return toBinding(row);
}

export function detachBinding(
  db: OrgSqliteDb,
  orgId: string,
  bindingId: string,
  updatedAt: string,
): void {
  db.update(connectorBindingsTable)
    .set({ threadId: null, status: 'unpaired', updatedAt })
    .where(and(eq(connectorBindingsTable.orgId, orgId), eq(connectorBindingsTable.id, bindingId)))
    .run();
}

export function updateBindingTitle(
  db: OrgSqliteDb,
  orgId: string,
  bindingId: string,
  title: string,
  updatedAt: string,
): void {
  db.update(connectorBindingsTable)
    .set({ title, updatedAt })
    .where(and(eq(connectorBindingsTable.orgId, orgId), eq(connectorBindingsTable.id, bindingId)))
    .run();
}

export function deleteBinding(db: OrgSqliteDb, orgId: string, bindingId: string): void {
  db.delete(connectorBindingsTable)
    .where(and(eq(connectorBindingsTable.orgId, orgId), eq(connectorBindingsTable.id, bindingId)))
    .run();
}

export function clearBindings(db: OrgSqliteDb, connectorId: string): void {
  db.delete(connectorBindingsTable)
    .where(eq(connectorBindingsTable.connectorId, connectorId))
    .run();
}
