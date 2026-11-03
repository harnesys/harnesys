import {
  type AnySQLiteColumn,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const threadParticipantsTable = sqliteTable(
  'thread_participants',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    displayName: text('display_name').notNull(),
    username: text('username'),
    role: text('role', { enum: ['member', 'blocked'] })
      .notNull()
      .default('member'),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    identityIdx: uniqueIndex('thread_participants_identity_idx').on(
      table.threadId,
      table.provider,
      table.providerUserId,
    ),
    threadIdx: index('thread_participants_thread_idx').on(table.threadId),
  }),
);

export type ThreadParticipantRow = typeof threadParticipantsTable.$inferSelect;
export type ThreadParticipantInsertRow = typeof threadParticipantsTable.$inferInsert;
