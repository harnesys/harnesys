import { describe, expect, test } from 'bun:test';
import {
  AccountLockedException,
  InvalidCredentialsException,
  SessionExpiredException,
  SessionReuseException,
} from '../../domain/identity/identity.error.ts';
import { IdentityAudit, type IdentityAuditRow } from '../../domain/identity/identity-audit.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import {
  type ActiveUserSessionRow,
  type ConsumedRefreshRecord,
  type CreateFamilyInput,
  type RotatedSessionInput,
  type SessionRecord,
  SessionStore,
} from '../../domain/identity/session-store.port.ts';
import {
  type InsertUserInput,
  type LoginAttemptRow,
  LoginAttemptStore,
  type UserRecord,
  UserRepository,
} from '../../domain/identity/user-repository.port.ts';
import { hashToken } from './hash-token.ts';
import { InitOwnerUseCase } from './init-owner.use-case.ts';
import { LoginUseCase } from './login.use-case.ts';
import { LogoutUseCase } from './logout.use-case.ts';
import { RefreshSessionUseCase } from './refresh-session.use-case.ts';

const NOW = '2026-10-14T12:00:00.000Z';
const NOW_PLUS_SEC = '2026-10-14T12:00:01.000Z';
const NOW_PLUS_17_MIN = new Date(Date.parse(NOW) + 17 * 60 * 1000).toISOString();

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
    if (existing && existing.updatedAt >= user.updatedAt) {
      return;
    }
    if (existing) {
      Object.assign(existing, user);
      return;
    }
    this.rows.push({ ...user });
  }
}

class FakeAttempts extends LoginAttemptStore {
  readonly rows: LoginAttemptRow[] = [];

  record(login: string, at: string): void {
    this.rows.push({ login, at });
  }

  listSince(login: string, sinceIso: string): LoginAttemptRow[] {
    return this.rows.filter((row) => row.login === login && row.at > sinceIso);
  }

  countFor(login: string): number {
    return this.rows.filter((row) => row.login === login).length;
  }

  clear(login: string): void {
    this.rows.splice(0, this.rows.length, ...this.rows.filter((row) => row.login !== login));
  }
}

class FakeSessions extends SessionStore {
  readonly rows: SessionRecord[] = [];
  readonly consumed = new Map<string, ConsumedRefreshRecord>();

  createFamily(input: CreateFamilyInput): void {
    this.rows.push({ ...input, revokedAt: null, revokedReason: null });
  }

  rotate(input: RotatedSessionInput, oldRefreshHash: string): void {
    const old = this.rows.find((row) => row.refreshHash === oldRefreshHash);
    if (!old) {
      throw new Error(`session not found for rotation: ${oldRefreshHash}`);
    }
    this.consumed.set(old.refreshHash, {
      refreshHash: old.refreshHash,
      familyId: old.familyId,
      consumedAt: input.lastUsedAt,
    });
    this.rows.splice(this.rows.indexOf(old), 1);
    this.rows.push({ ...input, createdAt: input.lastUsedAt, revokedAt: null, revokedReason: null });
  }

  consumeRefresh(refreshHash: string, familyId: string, consumedAt: string): void {
    this.consumed.set(refreshHash, { refreshHash, familyId, consumedAt });
  }

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

  findConsumedRefresh(refreshHash: string): ConsumedRefreshRecord | null {
    return this.consumed.get(refreshHash) ?? null;
  }

  replaceAccessHash(sessionId: string, accessHash: string): void {
    const row = this.rows.find((entry) => entry.id === sessionId);
    if (row) {
      row.accessHash = accessHash;
    }
  }
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
  const attempts = new FakeAttempts();
  const sessions = new FakeSessions();
  const audit = new FakeAudit();
  const hasher = new FakeHasher();
  return {
    users,
    attempts,
    sessions,
    audit,
    hasher,
    login: new LoginUseCase(users, attempts, sessions, hasher, audit),
    refresh: new RefreshSessionUseCase(sessions, audit),
    logout: new LogoutUseCase(sessions, audit),
    owner: new InitOwnerUseCase(users, hasher, audit),
  };
}

describe('identity session use-cases', () => {
  test('refresh rotation detects reuse, revokes the family and logout revokes', async () => {
    const app = build();

    const owner = await app.owner.execute({
      login: 'owner',
      name: 'Owner',
      password: 'pw',
      now: NOW,
    });
    expect(owner.userId).toBeTruthy();
    expect(app.users.findByLogin('owner')?.name).toBe('Owner');
    await expect(
      app.owner.execute({ login: 'owner', name: 'Owner', password: 'pw', now: NOW }),
    ).rejects.toThrow();
    expect(app.audit.rows.some((row) => row.action === 'owner_init')).toBe(true);

    app.users.insert({
      id: 'u-1',
      login: 'ann',
      name: 'Ann',
      passwordHash: 'pw$secret',
      createdAt: NOW,
    });

    const first = await app.login.execute({ login: 'ann', password: 'secret', now: NOW });
    expect(first.accessToken).toBeTruthy();
    expect(first.accessExpiresAt).toBe(new Date(Date.parse(NOW) + 10 * 60 * 1000).toISOString());
    expect(first.refreshExpiresAt).toBe(
      new Date(Date.parse(NOW) + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(app.sessions.rows[0]?.accessHash).toBe(await hashToken(first.accessToken));
    expect(app.sessions.rows[0]?.refreshHash).toBe(await hashToken(first.refreshToken));

    const second = await app.refresh.execute({
      refreshToken: first.refreshToken,
      now: NOW_PLUS_SEC,
    });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.refreshExpiresAt).toBe(
      new Date(Date.parse(NOW) + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(app.sessions.findConsumedRefresh(await hashToken(first.refreshToken))?.familyId).toBe(
      app.sessions.findByRefreshHash(await hashToken(second.refreshToken))?.familyId,
    );
    expect(app.sessions.findByRefreshHash(await hashToken(first.refreshToken))).toBeNull();

    await expect(
      app.refresh.execute({ refreshToken: first.refreshToken, now: NOW_PLUS_SEC }),
    ).rejects.toThrow(SessionReuseException);
    const afterReuse = app.sessions.findByRefreshHash(await hashToken(second.refreshToken));
    expect(afterReuse?.revokedReason).toBe('reuse');
    expect(afterReuse?.revokedAt).toBe(NOW_PLUS_SEC);
    await expect(
      app.refresh.execute({ refreshToken: second.refreshToken, now: NOW_PLUS_SEC }),
    ).rejects.toThrow(SessionExpiredException);
    expect(app.audit.rows.some((row) => row.action === 'reuse_revoked')).toBe(true);

    const third = await app.login.execute({ login: 'ann', password: 'secret', now: NOW_PLUS_SEC });
    await app.logout.execute({ refreshToken: third.refreshToken, now: NOW_PLUS_SEC });
    expect(app.sessions.findByRefreshHash(await hashToken(third.refreshToken))?.revokedReason).toBe(
      'logout',
    );
    await expect(
      app.refresh.execute({ refreshToken: third.refreshToken, now: NOW_PLUS_SEC }),
    ).rejects.toThrow(SessionExpiredException);
    expect(app.audit.rows.some((row) => row.action === 'logout')).toBe(true);
    expect(app.audit.rows.some((row) => row.action === 'login')).toBe(true);
    expect(app.audit.rows.some((row) => row.action === 'refresh')).toBe(true);
  });

  test('login policy: generic failures lock the account for 15 minutes on 5 failures', async () => {
    const app = build();
    app.users.insert({
      id: 'u-2',
      login: 'bob',
      name: 'Bob',
      passwordHash: 'pw$right',
      createdAt: NOW,
    });

    for (let index = 0; index < 5; index += 1) {
      await expect(
        app.login.execute({ login: 'bob', password: 'wrong', now: NOW }),
      ).rejects.toThrow(InvalidCredentialsException);
    }
    expect(app.attempts.countFor('bob')).toBe(5);

    let failure: unknown;
    try {
      await app.login.execute({ login: 'bob', password: 'right', now: NOW });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AccountLockedException);
    if (failure instanceof AccountLockedException) {
      expect(failure.retryAfterSec).toBe(900);
    }
    expect(app.attempts.countFor('bob')).toBe(5);
    expect(app.audit.rows.some((row) => row.action === 'locked')).toBe(true);

    const unlocked = await app.login.execute({
      login: 'bob',
      password: 'right',
      now: NOW_PLUS_17_MIN,
    });
    expect(unlocked.accessToken).toBeTruthy();
    expect(app.attempts.countFor('bob')).toBe(0);

    await expect(
      app.login.execute({ login: 'ghost', password: 'guess', now: NOW_PLUS_17_MIN }),
    ).rejects.toThrow(InvalidCredentialsException);
    expect(app.attempts.countFor('ghost')).toBe(1);
    expect(
      app.audit.rows.filter((row) => row.action === 'login_failed' && row.actorId === 'ghost')
        .length,
    ).toBe(1);
    expect(app.sessions.findByRefreshHash(await hashToken(unlocked.refreshToken))?.userId).toBe(
      'u-2',
    );
  });
});
