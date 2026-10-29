import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orgConfigRevisionsTable = sqliteTable('org_config_revisions', {
  orgId: text('org_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  contentHash: text('content_hash').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
});

export const nodeSnapshotAcksTable = sqliteTable(
  'node_snapshot_acks',
  {
    orgId: text('org_id').notNull(),
    nodeId: text('node_id').notNull(),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.nodeId] }),
  }),
);

export const orgExecutionReplicaTable = sqliteTable('org_execution_replica', {
  orgId: text('org_id').primaryKey(),
  revision: integer('revision').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  status: text('status').notNull(),
  payloadJson: text('payload_json').notNull(),
  acceptedAt: text('accepted_at').notNull(),
});

export const pendingRunEventsTable = sqliteTable(
  'pending_run_events',
  {
    runId: text('run_id').notNull(),
    leaseEpoch: integer('lease_epoch').notNull(),
    seq: integer('seq').notNull(),
    startedByUserId: text('started_by_user_id'),
    via: text('via').notNull().default('direct'),
    onNodeId: text('on_node_id'),
    payloadJson: text('payload_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.leaseEpoch, table.seq] }),
  }),
);

export const workerOrgOperationReceiptsTable = sqliteTable(
  'worker_org_operation_receipts',
  {
    orgId: text('org_id').notNull(),
    runId: text('run_id').notNull(),
    operationId: text('operation_id').notNull(),
    resultJson: text('result_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.runId, table.operationId] }),
  }),
);

export type OrgConfigRevisionRow = typeof orgConfigRevisionsTable.$inferSelect;
export type NodeSnapshotAckRow = typeof nodeSnapshotAcksTable.$inferSelect;
export type OrgExecutionReplicaRow = typeof orgExecutionReplicaTable.$inferSelect;
export type PendingRunEventRow = typeof pendingRunEventsTable.$inferSelect;
export type WorkerOrgOperationReceiptRow = typeof workerOrgOperationReceiptsTable.$inferSelect;
