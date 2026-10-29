import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { runsTable } from './runs.ts';

export const runSnapshotsTable = sqliteTable(
  'run_snapshots',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => runsTable.runId, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    snapshot: text('snapshot').notNull(),
    status: text('status').notNull(),
    runtimeVersion: text('runtime_version').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    sessionIdx: index('run_snapshots_session_idx').on(table.sessionId),
  }),
);

export type RunSnapshotRow = typeof runSnapshotsTable.$inferSelect;
export type RunSnapshotInsert = typeof runSnapshotsTable.$inferInsert;
