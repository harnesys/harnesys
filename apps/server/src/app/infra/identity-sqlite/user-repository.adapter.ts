import { Injectable } from '@harnesys/brix';
import { and, asc, eq, gt } from 'drizzle-orm';
import {
  type InsertUserInput,
  type LoginAttemptRow,
  LoginAttemptStore,
  type UserRecord,
  UserRepository,
} from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { loginAttempts, users } from './identity.schema.ts';
import { openIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class UserRepositoryAdapter extends UserRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(user: InsertUserInput): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db
        .insert(users)
        .values({
          id: user.id,
          login: user.login,
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        })
        .run();
    } finally {
      sqlite.sqlite.close();
    }
  }

  findByLogin(login: string): UserRecord | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db.select().from(users).where(eq(users.login, login)).get();
      return row ? mapUser(row) : null;
    } finally {
      sqlite.sqlite.close();
    }
  }

  findById(id: string): UserRecord | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db.select().from(users).where(eq(users.id, id)).get();
      return row ? mapUser(row) : null;
    } finally {
      sqlite.sqlite.close();
    }
  }

  updatePasswordHash(id: string, passwordHash: string, updatedAt: string): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, id)).run();
    } finally {
      sqlite.sqlite.close();
    }
  }

  count(): number {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const rows = sqlite.db.select({ id: users.id }).from(users).all();
      return rows.length;
    } finally {
      sqlite.sqlite.close();
    }
  }

  upsertSync(user: UserRecord): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const existing = sqlite.db.select().from(users).where(eq(users.id, user.id)).get();
      if (existing && existing.updatedAt >= user.updatedAt) {
        return;
      }
      if (existing) {
        sqlite.db
          .update(users)
          .set({
            login: user.login,
            name: user.name,
            passwordHash: user.passwordHash,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })
          .where(eq(users.id, user.id))
          .run();
        return;
      }
      sqlite.db
        .insert(users)
        .values({
          id: user.id,
          login: user.login,
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .run();
    } finally {
      sqlite.sqlite.close();
    }
  }
}

@Injectable()
export class LoginAttemptStoreAdapter extends LoginAttemptStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(login: string, at: string): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db.insert(loginAttempts).values({ login, at }).run();
    } finally {
      sqlite.sqlite.close();
    }
  }

  listSince(login: string, sinceIso: string): LoginAttemptRow[] {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const rows = sqlite.db
        .select()
        .from(loginAttempts)
        .where(and(eq(loginAttempts.login, login), gt(loginAttempts.at, sinceIso)))
        .orderBy(asc(loginAttempts.at))
        .all();
      return rows.map((row) => ({ login: row.login, at: row.at }));
    } finally {
      sqlite.sqlite.close();
    }
  }

  clear(login: string): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db.delete(loginAttempts).where(eq(loginAttempts.login, login)).run();
    } finally {
      sqlite.sqlite.close();
    }
  }
}

function mapUser(row: {
  id: string;
  login: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}): UserRecord {
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
