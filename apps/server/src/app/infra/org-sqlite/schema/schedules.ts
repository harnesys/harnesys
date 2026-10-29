import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { threadsTable } from './threads.ts';

export const schedulesTable = sqliteTable(
  'schedules',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'paused', 'failed'] })
      .notNull()
      .default('active'),
    targetAgentId: text('target_agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    detail: text('detail').notNull().default(''),
    cron: text('cron').notNull(),
    modeId: text('mode_id').notNull().default('default'),
    history: text('history', { enum: ['none', 'last', 'all'] })
      .notNull()
      .default('none'),
    historyLast: integer('history_last').notNull().default(1),
    missPolicy: text('miss_policy', { enum: ['catch-up', 'skip', 'escalate'] })
      .notNull()
      .default('catch-up'),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id),
    nextRunAt: text('next_run_at'),
    lastFiredAt: text('last_fired_at'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'schedules_status_check',
      sql`${table.status} IN ('active', 'paused', 'failed')`,
    ),
    historyCheck: check(
      'schedules_history_check',
      sql`${table.history} IN ('none', 'last', 'all')`,
    ),
    missPolicyCheck: check(
      'schedules_miss_policy_check',
      sql`${table.missPolicy} IN ('catch-up', 'skip', 'escalate')`,
    ),
    orgIdx: index('schedules_org_idx').on(table.orgId),
    dueIdx: index('schedules_due_idx').on(table.status, table.nextRunAt),
    threadIdx: uniqueIndex('schedules_thread_idx').on(table.threadId),
  }),
);

export const scheduleFiresTable = sqliteTable('schedule_fires', {
  fireId: text('fire_id').primaryKey(),
  scheduleId: text('schedule_id')
    .notNull()
    .references((): AnySQLiteColumn => schedulesTable.id, { onDelete: 'cascade' }),
  runId: text('run_id'),
  createdAt: text('created_at').notNull(),
});

export type ScheduleRow = typeof schedulesTable.$inferSelect;
export type ScheduleInsert = typeof schedulesTable.$inferInsert;
export type ScheduleFireRow = typeof scheduleFiresTable.$inferSelect;
export type ScheduleFireInsert = typeof scheduleFiresTable.$inferInsert;
