import { index, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    login: text('login').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    loginUnique: uniqueIndex('users_login_unique').on(table.login),
  }),
);

export const memberships = sqliteTable(
  'memberships',
  {
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    capabilitiesJson: text('capabilities_json').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.orgId] }),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    refreshHash: text('refresh_hash').notNull(),
    accessHash: text('access_hash').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    absoluteExpiresAt: text('absolute_expires_at').notNull(),
    revokedAt: text('revoked_at'),
    revokedReason: text('revoked_reason'),
  },
  (table) => ({
    refreshHashUnique: uniqueIndex('sessions_refresh_hash_unique').on(table.refreshHash),
    accessHashUnique: uniqueIndex('sessions_access_hash_unique').on(table.accessHash),
  }),
);

export const consumedRefreshes = sqliteTable('consumed_refreshes', {
  refreshHash: text('refresh_hash').primaryKey(),
  familyId: text('family_id').notNull(),
  consumedAt: text('consumed_at').notNull(),
});

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    login: text('login').notNull(),
    at: text('at').notNull(),
  },
  (table) => [index('login_attempts_login_idx').on(table.login, table.at)],
);

export const userInvites = sqliteTable(
  'user_invites',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    codeHash: text('code_hash').notNull(),
    capabilitiesJson: text('capabilities_json').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdBy: text('created_by').notNull(),
  },
  (table) => ({
    codeHashUnique: uniqueIndex('user_invites_code_hash_unique').on(table.codeHash),
  }),
);

export const identityAudit = sqliteTable('identity_audit', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  actorKind: text('actor_kind').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  result: text('result').notNull(),
  reason: text('reason'),
});
