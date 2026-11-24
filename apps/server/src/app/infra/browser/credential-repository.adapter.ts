import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { BrowserCredentialStatus } from '@harnesys/contracts';
import { and, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { BrowserCredentialValidationException } from '../../domain/browser/browser-credential.error.ts';
import {
  type BrowserCredentialRecord,
  BrowserCredentialRepositoryPort,
  type BrowserCredentialUpsert,
} from '../../domain/browser/credential-repository.port.ts';
import { isLockedOut, nextLockoutState } from '../../domain/browser/lockout.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { BROWSER_LOGIN_PREFIX } from '../../domain/secret/vault-keys.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { configureOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type BrowserCredentialRow,
  browserCredentialsTable,
} from '../org-sqlite/schema/browser-credentials.ts';

@Injectable()
export class BrowserCredentialRepositoryAdapter extends BrowserCredentialRepositoryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly secrets: SecretStorePort,
  ) {
    super();
  }

  async list(orgId: string): Promise<BrowserCredentialRecord[]> {
    return this.withDb(orgId, (db) =>
      db
        .select()
        .from(browserCredentialsTable)
        .where(eq(browserCredentialsTable.orgId, orgId))
        .all()
        .map((row) => toRecord(row)),
    );
  }

  async get(orgId: string, id: string): Promise<BrowserCredentialRecord | null> {
    return this.withDb(orgId, (db) => {
      const row = db
        .select()
        .from(browserCredentialsTable)
        .where(and(eq(browserCredentialsTable.orgId, orgId), eq(browserCredentialsTable.id, id)))
        .get();
      return row ? toRecord(row) : null;
    });
  }

  async put(
    orgId: string,
    id: string,
    data: BrowserCredentialUpsert,
  ): Promise<BrowserCredentialRecord> {
    return this.withDb(orgId, (db) => {
      const existing = db
        .select()
        .from(browserCredentialsTable)
        .where(and(eq(browserCredentialsTable.orgId, orgId), eq(browserCredentialsTable.id, id)))
        .get();
      const clash = db
        .select({ id: browserCredentialsTable.id })
        .from(browserCredentialsTable)
        .where(
          and(
            eq(browserCredentialsTable.orgId, orgId),
            eq(browserCredentialsTable.name, data.name),
            ne(browserCredentialsTable.id, id),
          ),
        )
        .get();
      if (clash) {
        throw new BrowserCredentialValidationException(
          `name "${data.name}" is already used by another website login`,
        );
      }
      const now = new Date().toISOString();
      if (existing) {
        db.update(browserCredentialsTable)
          .set({ ...data, egressHosts: JSON.stringify(data.egressHosts), updatedAt: now })
          .where(and(eq(browserCredentialsTable.orgId, orgId), eq(browserCredentialsTable.id, id)))
          .run();
        return readRow(db, id);
      }
      db.insert(browserCredentialsTable)
        .values({
          id,
          orgId,
          name: data.name,
          loginUrl: data.loginUrl,
          username: data.username,
          usernameSelector: data.usernameSelector,
          passwordSelector: data.passwordSelector,
          submitSelector: data.submitSelector,
          preLoginSelector: data.preLoginSelector,
          successUrlPathPrefix: data.successUrlPathPrefix,
          successCookieName: data.successCookieName,
          successSelector: data.successSelector,
          challengeCodeSelector: data.challengeCodeSelector,
          challengeSubmitSelector: data.challengeSubmitSelector,
          egressHosts: JSON.stringify(data.egressHosts),
          status: 'unverified',
          failureCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return readRow(db, id);
    });
  }

  async delete(orgId: string, id: string): Promise<void> {
    await this.withDb(orgId, (db) => {
      db.delete(browserCredentialsTable)
        .where(and(eq(browserCredentialsTable.orgId, orgId), eq(browserCredentialsTable.id, id)))
        .run();
      return null;
    });
    await this.secrets.delete(orgId, `${BROWSER_LOGIN_PREFIX}${id}`);
  }

  async recordResult(orgId: string, id: string, ok: boolean): Promise<BrowserCredentialRecord> {
    const record = await this.get(orgId, id);
    if (!record) {
      return Promise.reject(new Error(`browser credential not found: ${id}`));
    }
    const now = new Date().toISOString();
    return this.withDb(orgId, (db) => {
      if (ok) {
        db.update(browserCredentialsTable)
          .set({
            status: 'ok',
            failureCount: 0,
            lockedUntil: null,
            lastLoginAt: now,
            updatedAt: now,
          })
          .where(eq(browserCredentialsTable.id, id))
          .run();
      } else {
        const next = nextLockoutState(record.failureCount, Date.now());
        const stillLocked = isLockedOut({ lockedUntil: next.lockedUntil }, Date.now());
        db.update(browserCredentialsTable)
          .set({
            status: stillLocked ? 'locked' : 'failing',
            failureCount: next.failureCount,
            lockedUntil: next.lockedUntil,
            updatedAt: now,
          })
          .where(eq(browserCredentialsTable.id, id))
          .run();
      }
      const row = db
        .select()
        .from(browserCredentialsTable)
        .where(eq(browserCredentialsTable.id, id))
        .get();
      return row === undefined
        ? Promise.reject(new Error(`browser credential not found: ${id}`))
        : toRecord(row);
    });
  }

  async resetStatus(orgId: string, id: string): Promise<BrowserCredentialRecord> {
    return this.withDb(orgId, (db) => {
      const now = new Date().toISOString();
      db.update(browserCredentialsTable)
        .set({ status: 'unverified', failureCount: 0, lockedUntil: null, updatedAt: now })
        .where(and(eq(browserCredentialsTable.orgId, orgId), eq(browserCredentialsTable.id, id)))
        .run();
      return readRow(db, id);
    });
  }

  private withDb<T>(orgId: string, fn: (db: ReturnType<typeof openDb>) => T): T {
    const sqlite = this.open(orgId);
    try {
      return fn(openDb(sqlite));
    } finally {
      sqlite.close();
    }
  }

  private open(orgId: string): Database {
    const path = this.layout.orgDbPath(orgId);
    if (!existsSync(path) && !existsSync(dirname(path))) {
      this.layout.ensureOrgDir(orgId);
    }
    const sqlite = new Database(path, { create: true });
    configureOrgSqlite(sqlite);
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    return sqlite;
  }
}

function openDb(sqlite: Database) {
  return drizzle(sqlite, { schema: { browserCredentialsTable } });
}

type CredentialsDb = ReturnType<typeof openDb>;

function readRow(db: CredentialsDb, id: string): BrowserCredentialRecord {
  const row = db
    .select()
    .from(browserCredentialsTable)
    .where(eq(browserCredentialsTable.id, id))
    .get();
  if (row === undefined) {
    throw new BrowserCredentialValidationException(`browser credential row missing: ${id}`);
  }
  return toRecord(row);
}

function toRecord(row: BrowserCredentialRow): BrowserCredentialRecord {
  let hosts: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.egressHosts);
    if (Array.isArray(parsed)) {
      hosts = parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    hosts = [];
  }
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    loginUrl: row.loginUrl,
    username: row.username,
    usernameSelector: row.usernameSelector,
    passwordSelector: row.passwordSelector,
    submitSelector: row.submitSelector,
    preLoginSelector: row.preLoginSelector,
    successUrlPathPrefix: row.successUrlPathPrefix,
    successCookieName: row.successCookieName,
    successSelector: row.successSelector,
    challengeCodeSelector: row.challengeCodeSelector,
    challengeSubmitSelector: row.challengeSubmitSelector,
    egressHosts: hosts,
    status: row.status as BrowserCredentialStatus,
    failureCount: row.failureCount,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
