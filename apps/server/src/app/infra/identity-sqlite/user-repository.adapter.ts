import { Injectable } from '@harnesys/brix';
import { type EntityColorName, EntityColorSchema } from '@harnesys/contracts';
import { and, asc, eq, gt } from 'drizzle-orm';
import {
  type InsertUserInput,
  type LoginAttemptRow,
  LoginAttemptStore,
  type UpdateUserProfileInput,
  type UserRecord,
  UserRepository,
} from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { loginAttempts, users } from './identity.schema.ts';
import { withIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class UserRepositoryAdapter extends UserRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(user: InsertUserInput): void {
    withIdentitySqlite(this.layout, (db) => {
      db.insert(users)
        .values({
          id: user.id,
          login: user.login,
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        })
        .run();
    });
  }

  findByLogin(login: string): UserRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db.select().from(users).where(eq(users.login, login)).get();
      return row ? mapUser(row) : null;
    });
  }

  findById(id: string): UserRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db.select().from(users).where(eq(users.id, id)).get();
      return row ? mapUser(row) : null;
    });
  }

  updatePasswordHash(id: string, passwordHash: string, updatedAt: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, id)).run();
    });
  }

  updateProfile(input: UpdateUserProfileInput): void {
    withIdentitySqlite(this.layout, (db) => {
      db.update(users)
        .set({
          name: input.name,
          avatar: input.avatar,
          color: input.color,
          updatedAt: input.updatedAt,
        })
        .where(eq(users.id, input.id))
        .run();
    });
  }

  count(): number {
    return withIdentitySqlite(this.layout, (db) => {
      const rows = db.select({ id: users.id }).from(users).all();
      return rows.length;
    });
  }

  upsertSync(user: UserRecord): void {
    withIdentitySqlite(this.layout, (db) => {
      const existing = db.select().from(users).where(eq(users.id, user.id)).get();
      if (existing && existing.updatedAt >= user.updatedAt) {
        return;
      }
      if (existing) {
        db.update(users)
          .set({
            login: user.login,
            name: user.name,
            avatar: user.avatar,
            color: user.color,
            passwordHash: user.passwordHash,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })
          .where(eq(users.id, user.id))
          .run();
        return;
      }
      db.insert(users)
        .values({
          id: user.id,
          login: user.login,
          name: user.name,
          avatar: user.avatar,
          color: user.color,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .run();
    });
  }
}

@Injectable()
export class LoginAttemptStoreAdapter extends LoginAttemptStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(login: string, at: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.insert(loginAttempts).values({ login, at }).run();
    });
  }

  listSince(login: string, sinceIso: string): LoginAttemptRow[] {
    return withIdentitySqlite(this.layout, (db) => {
      const rows = db
        .select()
        .from(loginAttempts)
        .where(and(eq(loginAttempts.login, login), gt(loginAttempts.at, sinceIso)))
        .orderBy(asc(loginAttempts.at))
        .all();
      return rows.map((row) => ({ login: row.login, at: row.at }));
    });
  }

  clear(login: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.delete(loginAttempts).where(eq(loginAttempts.login, login)).run();
    });
  }
}

function mapUser(row: {
  id: string;
  login: string;
  name: string;
  avatar: string | null;
  color: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}): UserRecord {
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    avatar: row.avatar,
    color: userColorOf(row.color),
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function userColorOf(value: string | null): EntityColorName | null {
  const parsed = EntityColorSchema.nullable().safeParse(value);
  return parsed.success ? parsed.data : null;
}
