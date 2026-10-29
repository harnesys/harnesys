import { describe, expect, test } from 'bun:test';
import { EntityNotFoundException, ForbiddenException } from '@harnesys/brix';
import { IdentityAudit, type IdentityAuditRow } from '../../domain/identity/identity-audit.port.ts';
import {
  type MembershipRecord,
  MembershipRepository,
} from '../../domain/identity/membership-repository.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { ROLE_PRESETS } from '../../domain/identity/role-presets.ts';
import {
  type ActiveUserSessionRow,
  type SessionRecord,
  SessionStore,
} from '../../domain/identity/session-store.port.ts';
import {
  type InsertUserInput,
  type UserRecord,
  UserRepository,
} from '../../domain/identity/user-repository.port.ts';
import { generateOneTimePassword } from './one-time-password.ts';
import { ResetMemberPasswordUseCase } from './reset-member-password.use-case.ts';

const NOW = '2026-10-15T12:00:00.000Z';

class FakeMemberships extends MembershipRepository {
  readonly rows: MembershipRecord[] = [];

  upsert(membership: MembershipRecord): void {
    this.rows.push({ ...membership });
  }

  upsertSync(membership: MembershipRecord): void {
    this.rows.push({ ...membership });
  }

  findByUserAndOrg(userId: string, orgId: string): MembershipRecord | null {
    return this.rows.find((row) => row.userId === userId && row.orgId === orgId) ?? null;
  }

  listByUser(userId: string): MembershipRecord[] {
    return this.rows.filter((row) => row.userId === userId);
  }

  listByOrg(orgId: string): MembershipRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }

  remove(userId: string, orgId: string): void {
    const index = this.rows.findIndex((row) => row.userId === userId && row.orgId === orgId);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
  }
}

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
    this.rows.push({ ...user });
  }
}

class FakeSessions extends SessionStore {
  readonly rows: SessionRecord[] = [];

  record(id: string, userId: string): void {
    this.rows.push({
      id,
      familyId: `family-${id}`,
      userId,
      orgId: 'org-1',
      refreshHash: `refresh-${id}`,
      accessHash: `access-${id}`,
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: NOW,
      absoluteExpiresAt: NOW,
      revokedAt: null,
      revokedReason: null,
    });
  }

  createFamily(): void {
    throw new Error('not used');
  }

  rotate(): void {
    throw new Error('not used');
  }

  consumeRefresh(): void {
    throw new Error('not used');
  }

  revokeFamily(): void {
    throw new Error('not used');
  }

  revokeUserFamiliesExcept(): void {
    throw new Error('not used');
  }

  listActiveByUser(): ActiveUserSessionRow[] {
    return [];
  }

  revokeUserFamilies(userId: string, revokedAt: string, reason: string): void {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === null) {
        row.revokedAt = revokedAt;
        row.revokedReason = reason;
      }
    }
  }

  findByAccessHash(): SessionRecord | null {
    return null;
  }

  findByRefreshHash(): SessionRecord | null {
    return null;
  }

  findConsumedRefresh(): null {
    return null;
  }

  replaceAccessHash(): void {
    throw new Error('not used');
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

function user(userId: string, capabilities: string[]): Principal {
  return { kind: 'user', userId, capabilities, orgId: 'org-1' };
}

function build() {
  const memberships = new FakeMemberships();
  const users = new FakeUsers();
  const sessions = new FakeSessions();
  const audit = new FakeAudit();
  const hasher = new FakeHasher();
  memberships.upsert({
    userId: 'u-target',
    orgId: 'org-1',
    capabilities: [...ROLE_PRESETS.operator],
    updatedAt: NOW,
  });
  memberships.upsert({
    userId: 'u-owner',
    orgId: 'org-1',
    capabilities: [...ROLE_PRESETS.owner],
    updatedAt: NOW,
  });
  users.insert({
    id: 'u-target',
    login: 'ann',
    name: 'Ann',
    passwordHash: 'pw$old-secret',
    createdAt: NOW,
  });
  sessions.record('s-1', 'u-target');
  sessions.record('s-2', 'u-target');
  sessions.record('s-3', 'u-other');
  return {
    memberships,
    users,
    sessions,
    audit,
    hasher,
    reset: new ResetMemberPasswordUseCase(memberships, users, sessions, hasher, audit),
  };
}

describe('reset member password', () => {
  test('member.manage resets the hash, revokes the user session families, and audits', async () => {
    const app = build();

    const result = await app.reset.execute({
      principal: user('u-owner', [...ROLE_PRESETS.owner]),
      orgId: 'org-1',
      userId: 'u-target',
      now: NOW,
    });

    expect(result.userId).toBe('u-target');
    expect(result.temporaryPassword).toMatch(/^[a-z2-9]{20}$/);
    const userRow = app.users.findById('u-target');
    expect(userRow?.passwordHash).toBe(`pw$${result.temporaryPassword}`);
    expect(userRow?.updatedAt).toBe(NOW);
    expect(await app.hasher.verify(result.temporaryPassword, userRow?.passwordHash ?? '')).toBe(
      true,
    );
    expect(await app.hasher.verify('old-secret', userRow?.passwordHash ?? '')).toBe(false);
    expect(app.sessions.rows.find((row) => row.id === 's-1')?.revokedReason).toBe('password_reset');
    expect(app.sessions.rows.find((row) => row.id === 's-2')?.revokedReason).toBe('password_reset');
    expect(app.sessions.rows.find((row) => row.id === 's-3')?.revokedReason).toBeNull();
    expect(app.audit.rows.at(-1)).toMatchObject({
      actorKind: 'user',
      actorId: 'u-owner',
      action: 'member_password_reset',
      result: 'ok',
      reason: 'u-target',
    });
  });

  test('denies without member.manage, wrong org, or unknown membership/user', async () => {
    const app = build();

    await expect(
      app.reset.execute({
        principal: user('u-owner', [...ROLE_PRESETS.operator]),
        orgId: 'org-1',
        userId: 'u-target',
        now: NOW,
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      app.reset.execute({
        principal: user('u-owner', [...ROLE_PRESETS.owner]),
        orgId: 'org-2',
        userId: 'u-target',
        now: NOW,
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      app.reset.execute({
        principal: user('u-owner', [...ROLE_PRESETS.owner]),
        orgId: 'org-1',
        userId: 'u-ghost',
        now: NOW,
      }),
    ).rejects.toThrow(EntityNotFoundException);
    expect(app.users.findById('u-target')?.passwordHash).toBe('pw$old-secret');
    expect(app.sessions.rows.every((row) => row.revokedAt === null)).toBe(true);
  });

  test('one-time passwords are 20 unambiguous characters and collision-free across samples', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const otp = generateOneTimePassword();
      expect(otp).toMatch(/^[a-z2-9]{20}$/);
      for (const excluded of ['i', 'l', 'o', '0', '1']) {
        expect(otp).not.toContain(excluded);
      }
      seen.add(otp);
    }
    expect(seen.size).toBe(50);
  });
});
