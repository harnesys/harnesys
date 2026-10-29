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

export const issueBoardsTable = sqliteTable(
  'issue_boards',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#6366f1'),
    icon: text('icon').notNull().default('kanban-square'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check('issue_boards_status_check', sql`${table.status} IN ('active', 'archived')`),
    orgIdx: index('issue_boards_org_idx').on(table.orgId),
  }),
);

export const boardStatusesTable = sqliteTable(
  'board_statuses',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references((): AnySQLiteColumn => issueBoardsTable.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    category: text('category', {
      enum: ['backlog', 'started', 'finished', 'cancelled'],
    }).notNull(),
    order: integer('order').notNull().default(0),
    color: text('color'),
    isEntry: integer('is_entry', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    boardKeyIdx: uniqueIndex('board_statuses_board_key_idx').on(table.boardId, table.key),
    boardOrderIdx: index('board_statuses_board_order_idx').on(table.boardId, table.order),
  }),
);

export const boardRulesTable = sqliteTable(
  'board_rules',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    boardId: text('board_id')
      .notNull()
      .references((): AnySQLiteColumn => issueBoardsTable.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type').notNull(),
    triggerPayload: text('trigger_payload').notNull().default('{}'),
    conditions: text('conditions').notNull().default('[]'),
    actions: text('actions').notNull().default('[]'),
    position: integer('position').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    boardIdx: index('board_rules_board_idx').on(table.boardId, table.position),
  }),
);

export type IssueBoardRow = typeof issueBoardsTable.$inferSelect;
export type IssueBoardInsert = typeof issueBoardsTable.$inferInsert;
export type BoardStatusRow = typeof boardStatusesTable.$inferSelect;
export type BoardStatusInsert = typeof boardStatusesTable.$inferInsert;
export type BoardRuleRow = typeof boardRulesTable.$inferSelect;
export type BoardRuleInsert = typeof boardRulesTable.$inferInsert;
