import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const browserCredentialsTable = sqliteTable(
  'browser_credentials',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    loginUrl: text('login_url').notNull(),
    username: text('username').notNull(),
    usernameSelector: text('username_selector').notNull(),
    passwordSelector: text('password_selector').notNull(),
    submitSelector: text('submit_selector').notNull(),
    successUrlPathPrefix: text('success_url_path_prefix').notNull().default('/'),
    successCookieName: text('success_cookie_name'),
    successSelector: text('success_selector'),
    challengeCodeSelector: text('challenge_code_selector'),
    challengeSubmitSelector: text('challenge_submit_selector'),
    egressHosts: text('egress_hosts').notNull(),
    status: text('status').notNull().default('unverified'),
    failureCount: integer('failure_count').notNull().default(0),
    lockedUntil: text('locked_until'),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex('browser_credentials_org_name').on(table.orgId, table.name),
  }),
);

export type BrowserCredentialRow = typeof browserCredentialsTable.$inferSelect;
export type BrowserCredentialInsert = typeof browserCredentialsTable.$inferInsert;
