import { describe, expect, test } from 'bun:test';
import { ValidationException } from '@harnesys/brix';
import { InvalidCredentialsException } from '../../domain/identity/identity.error.ts';
import { IdentityAudit, type IdentityAuditRow } from '../../domain/identity/identity-audit.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import type {
  ActiveUserSessionRow,
  ConsumedRefreshRecord,
  CreateFamilyInput,
  RotatedSessionInput,
  SessionRecord,
} from '../../domain/identity/session-store.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import type { InsertUserInput, UserRecord } from '../../domain/identity/user-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { ChangePasswordUseCase } from './change-password.use-case.ts';
import { hashToken } from './hash-token.ts';
import { shapeSessionViews } from './list-sessions.use-case.ts';

const NOW = '2026-10-15T12:00:00.000Z';
const PRINCIPAL: Principal = { kind: 'user', userId: 'u-1', orgId: '', capabilities: [] };

class FakeUsers extends UserRepository {
  readonly rows: UserRecord[] = [];

  insert(user: InsertUserInput): void {
    this.rows.push({ ...user, updatedAt: user.createdAt });
  }

  findByLogin(login: string): UserRecord | null {
    return this.rows.find((row) => row.login === login) ?? null;
  }

  findById(id: string): UserRecord | null {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  updatePasswordHash(id: string, passwordHash: string, updatedAt: string): void {
    const user = this.rows.find((row) => row.id === id);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = updatedAt;
    }
  }

  count(): number {
    return this.rows.length;
  }

  upsertSync(user: UserRecord): void {
    const existing = this.rows.find((row) => row.id === user.id);
    if (existing) {
      Object.assign(existing, user);
    } else {
      this.rows.push({ ...user });
    }
  }
}

class FakeSessions extends SessionStore {
  readonly rows: SessionRecord[] = [];
  readonly revokedExcept: string[] = [];

  createFamily(input: CreateFamilyInput): void {
    this.rows.push({ ...input, revokedAt: null, revokedReason: null });
  }

  rotate(_session: RotatedSessionInput, _oldRefreshHash: string): void {}
  consumeRefresh(_refreshHash: string, _familyId: string, _consumedAt: string): void {}

  revokeFamily(familyId: string, revokedAt: string, reason: string): void {
    for (const row of this.rows) {
      if (row.familyId === familyId && row.revokedAt === null) {
        row.revokedAt = revokedAt;
        row.revokedReason = reason;
      }
    }
  }

  revokeUserFamilies(userId: string, revokedAt: string, reason: string): void {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === null) {
        row.revokedAt = revokedAt;
        row.revokedReason = reason;
      }
    }
  }

  revokeUserFamiliesExcept(
    userId: string,
    exceptFamilyId: string,
    revokedAt: string,
    reason: string,
  ): void {
    this.revokedExcept.push(exceptFamilyId);
    for (const row of this.rows) {
      if (row.userId === userId && row.familyId !== exceptFamilyId && row.revokedAt === null) {
        row.revokedAt = revokedAt;
        row.revokedReason = reason;
      }
    }
  }

  listActiveByUser(userId: string): ActiveUserSessionRow[] {
    return this.rows
      .filter((row) => row.userId === userId && row.revokedAt === null)
      .map((row) => ({
        familyId: row.familyId,
        userId: row.userId,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        absoluteExpiresAt: row.absoluteExpiresAt,
      }));
  }

  findByAccessHash(accessHash: string): SessionRecord | null {
    return this.rows.find((row) => row.accessHash === accessHash) ?? null;
  }

  findByRefreshHash(refreshHash: string): SessionRecord | null {
    return this.rows.find((row) => row.refreshHash === refreshHash) ?? null;
  }

  findConsumedRefresh(_refreshHash: string): ConsumedRefreshRecord | null {
    return null;
  }

  replaceAccessHash(): void {}
}

class FakeAudit extends IdentityAudit {
  readonly rows: IdentityAuditRow[] = [];

  append(row: IdentityAuditRow): void {
    this.rows.push(row);
  }
}

class FakeHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    return `pw$${password}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `pw$${password}`;
  }
}

function build() {
  const users = new FakeUsers();
  const sessions = new FakeSessions();
  const audit = new FakeAudit();
  const hasher = new FakeHasher();
  users.insert({
    id: 'u-1',
    login: 'ann',
    name: 'Ann',
    passwordHash: 'pw$secret',
    createdAt: NOW,
  });
  return {
    users,
    sessions,
    audit,
    change: new ChangePasswordUseCase(users, sessions, hasher, audit),
  };
}

async function seedSessions(sessions: FakeSessions): Promise<string> {
  const currentToken = 'token-current';
  const currentHash = await hashToken(currentToken);
  sessions.createFamily({
    id: 's-1',
    familyId: 'f-current',
    userId: 'u-1',
    orgId: '',
    refreshHash: 'r-1',
    accessHash: currentHash,
    createdAt: NOW,
    lastUsedAt: NOW,
    expiresAt: NOW,
    absoluteExpiresAt: NOW,
  });
  sessions.createFamily({
    id: 's-2',
    familyId: 'f-other',
    userId: 'u-1',
    orgId: '',
    refreshHash: 'r-2',
    accessHash: 'access-other',
    createdAt: NOW,
    lastUsedAt: NOW,
    expiresAt: NOW,
    absoluteExpiresAt: NOW,
  });
  sessions.createFamily({
    id: 's-3',
    familyId: 'f-other2',
    userId: 'u-1',
    orgId: '',
    refreshHash: 'r-3',
    accessHash: 'access-other2',
    createdAt: NOW,
    lastUsedAt: NOW,
    expiresAt: NOW,
    absoluteExpiresAt: NOW,
  });
  return currentToken;
}

describe('change-password use-case', () => {
  test('wrong current password: throws, keeps hash and sessions, audits denial', async () => {
    const app = build();
    const currentToken = await seedSessions(app.sessions);

    await expect(
      app.change.execute({
        principal: PRINCIPAL,
        currentPassword: 'wrong',
        newPassword: 'brand-new',
        currentAccessToken: currentToken,
        now: NOW,
      }),
    ).rejects.toThrow(InvalidCredentialsException);

    expect(app.users.findById('u-1')?.passwordHash).toBe('pw$secret');
    expect(app.sessions.rows.every((row) => row.revokedAt === null)).toBe(true);
    expect(app.audit.rows.some((row) => row.action === 'password_change_failed')).toBe(true);
    expect(app.audit.rows.some((row) => row.action === 'password_change')).toBe(false);
  });

  test('success: updates hash, revokes other families, keeps current, audits ok', async () => {
    const app = build();
    const currentToken = await seedSessions(app.sessions);

    await app.change.execute({
      principal: PRINCIPAL,
      currentPassword: 'secret',
      newPassword: 'brand-new',
      currentAccessToken: currentToken,
      now: NOW,
    });

    expect(app.users.findById('u-1')?.passwordHash).toBe('pw$brand-new');
    expect(app.sessions.revokedExcept).toEqual(['f-current']);
    const current = app.sessions.rows.find((row) => row.familyId === 'f-current');
    const other = app.sessions.rows.find((row) => row.familyId === 'f-other');
    const other2 = app.sessions.rows.find((row) => row.familyId === 'f-other2');
    expect(current?.revokedAt).toBeNull();
    expect(other?.revokedReason).toBe('password_change');
    expect(other2?.revokedReason).toBe('password_change');
    expect(app.audit.rows.some((row) => row.action === 'password_change')).toBe(true);
  });

  test('reusing the current password as new password is rejected', async () => {
    const app = build();
    const currentToken = await seedSessions(app.sessions);

    await expect(
      app.change.execute({
        principal: PRINCIPAL,
        currentPassword: 'secret',
        newPassword: 'secret',
        currentAccessToken: currentToken,
        now: NOW,
      }),
    ).rejects.toThrow(ValidationException);

    expect(app.sessions.revokedExcept).toEqual([]);
    expect(app.users.findById('u-1')?.passwordHash).toBe('pw$secret');
  });
});

describe('shapeSessionViews', () => {
  test('dedupes families, marks current, preserves order', () => {
    const views = shapeSessionViews(
      [
        {
          familyId: 'f-2',
          userId: 'u-1',
          createdAt: 'c2',
          lastUsedAt: 'l2',
          expiresAt: 'e2',
          absoluteExpiresAt: 'a2',
        },
        {
          familyId: 'f-1',
          userId: 'u-1',
          createdAt: 'c1',
          lastUsedAt: 'l1',
          expiresAt: 'e1',
          absoluteExpiresAt: 'a1',
        },
        {
          familyId: 'f-1',
          userId: 'u-1',
          createdAt: 'c1b',
          lastUsedAt: 'l1b',
          expiresAt: 'e1b',
          absoluteExpiresAt: 'a1b',
        },
      ],
      'f-1',
    );
    expect(views.map((view) => view.familyId)).toEqual(['f-2', 'f-1']);
    expect(views[0]?.current).toBe(false);
    expect(views[1]?.current).toBe(true);
    expect(views[1]?.createdAt).toBe('c1');
  });
});
