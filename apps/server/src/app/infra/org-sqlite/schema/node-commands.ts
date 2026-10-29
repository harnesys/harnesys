import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nodeCommandsTable = sqliteTable(
  'node_commands',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id').notNull(),
    commandJson: text('command_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    nodeCreated: index('node_commands_node').on(table.nodeId, table.createdAt),
  }),
);

export type NodeCommandRow = typeof nodeCommandsTable.$inferSelect;
export type NodeCommandInsert = typeof nodeCommandsTable.$inferInsert;
