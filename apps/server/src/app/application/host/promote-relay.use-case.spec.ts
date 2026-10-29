import { describe, expect, test } from 'bun:test';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { PromoteSessionStore } from '../../domain/fleet/promote-session.port.ts';
import type { MembershipRecord } from '../../domain/identity/membership-repository.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import type {
  ActiveUserSessionRow,
  SessionRecord,
} from '../../domain/identity/session-store.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import type { UserRecord } from '../../domain/identity/user-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { PromoteRelayUseCase, shouldImportDataArchive } from './promote-relay.use-case.ts';

describe('shouldImportDataArchive', () => {
  test('only 200 imports the archive, 404 and 500 skip it', () => {
    expect(shouldImportDataArchive(200)).toBe(true);
    expect(shouldImportDataArchive(404)).toBe(false);
    expect(shouldImportDataArchive(500)).toBe(false);
  });
});

class FakeUsers extends UserRepository {
  readonly rows: UserRecord[] = [];

  insert(): void {}
  findByLogin(): UserRecord | null {
    return null;
  }
  findById(id: string): UserRecord | null {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  updatePasswordHash(): void {}
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

class FakeMemberships extends MembershipRepository {
  readonly rows: MembershipRecord[] = [];

  upsert(membership: MembershipRecord): void {
    this.upsertSync(membership);
  }
  upsertSync(membership: MembershipRecord): void {
    const existing = this.rows.find(
      (row) => row.userId === membership.userId && row.orgId === membership.orgId,
    );
    if (existing && existing.updatedAt >= membership.updatedAt) {
      return;
    }
    if (existing) {
      Object.assign(existing, membership);
      return;
    }
    this.rows.push({ ...membership });
  }
  findByUserAndOrg(): MembershipRecord | null {
    return null;
  }
  listByUser(): MembershipRecord[] {
    return [];
  }
  listByOrg(orgId: string): MembershipRecord[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }
  remove(): void {}
}

class FakeIdentitySessions extends SessionStore {
  readonly rows: SessionRecord[] = [];

  createFamily(): void {}
  rotate(): void {}
  consumeRefresh(): void {}
  revokeFamily(): void {}
  revokeUserFamilies(userId: string, revokedAt: string, reason: string): void {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === null) {
        row.revokedAt = revokedAt;
        row.revokedReason = reason;
      }
    }
  }
  revokeUserFamiliesExcept(): void {}
  listActiveByUser(): ActiveUserSessionRow[] {
    return [];
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
  replaceAccessHash(): void {}
}

class FakeTicketKeys extends TicketKeyStore {
  get(): string | null {
    return null;
  }
  ensure(orgId: string): string {
    return `key:${orgId}`;
  }
  rotate(orgId: string): string {
    return `rotated:${orgId}`;
  }
}

class FakePromoteSessions extends PromoteSessionStore {
  create(): void {}
  get(): null {
    return null;
  }
  consume(): null {
    return null;
  }
}

class FakeNodes extends NodeRepository {
  insert(): void {}
  findById(): null {
    return null;
  }
  findByName(): null {
    return null;
  }
  findByTokenHash(): null {
    return null;
  }
  list(): never[] {
    return [];
  }
  updatePresence(): void {}
  setStatus(): void {}
  updateRoleAndToken(): void {}
  remove(): void {}
  readOrgName(): null {
    return null;
  }
  exportDbBytes(): Uint8Array {
    return new Uint8Array();
  }
  importDbBytes(_orgId: string, _bytes: Uint8Array): void {}
}

class FakeIdentities extends NodeIdentityStore {
  read(): null {
    return null;
  }
  write(): void {}
  remove(): void {}
  list(): never[] {
    return [];
  }
}

class FakeStore extends OrgMachineStore {
  list(): never[] {
    return [];
  }
  upsert(): void {}
  remove(): void {}
  getActive(): null {
    return null;
  }
  setActive(): void {}
  get(): undefined {
    return undefined;
  }
}

class FakeMachineConfig extends MachineConfigPort {
  get(): { id: string; name: string; listen: string; token: string } {
    throw new Error('unused');
  }
  set(): void {}
}

class FakeDataPack extends OrgDataPackPort {
  async pack(_orgId: string, _outPath: string): Promise<boolean> {
    return false;
  }
  async unpack(_orgId: string, _archivePath: string): Promise<void> {}
}

function userRecord(id: string, updatedAt: string): UserRecord {
  return {
    id,
    login: `${id}@login`,
    name: id,
    passwordHash: `hash-${id}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
  };
}

function sessionRecord(id: string, familyId: string, userId: string): SessionRecord {
  return {
    id,
    familyId,
    userId,
    orgId: 'org-1',
    refreshHash: `refresh-${id}`,
    accessHash: `access-${id}`,
    createdAt: '2026-10-14T00:00:00.000Z',
    lastUsedAt: '2026-10-14T00:00:00.000Z',
    expiresAt: '2026-10-15T00:00:00.000Z',
    absoluteExpiresAt: '2026-11-14T00:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
  };
}

describe('PromoteRelayUseCase identity slice', () => {
  test('export keeps org memberships + referenced users, import upserts and revokes their sessions', () => {
    const users = new FakeUsers();
    users.rows.push(userRecord('u1', '2026-10-10T00:00:00.000Z'));
    users.rows.push(userRecord('u2', '2026-10-11T00:00:00.000Z'));
    users.rows.push(userRecord('u3', '2026-10-12T00:00:00.000Z'));
    const memberships = new FakeMemberships();
    memberships.rows.push({
      userId: 'u1',
      orgId: 'org-1',
      capabilities: ['desk.write'],
      updatedAt: '2026-10-10T00:00:00.000Z',
    });
    memberships.rows.push({
      userId: 'u2',
      orgId: 'org-1',
      capabilities: [],
      updatedAt: '2026-10-11T00:00:00.000Z',
    });
    memberships.rows.push({
      userId: 'u3',
      orgId: 'org-2',
      capabilities: ['fleet.read'],
      updatedAt: '2026-10-12T00:00:00.000Z',
    });
    const sessions = new FakeIdentitySessions();
    sessions.rows.push(sessionRecord('s-1', 'family-1', 'u1'));
    sessions.rows.push(sessionRecord('s-2', 'family-2', 'u3'));
    const useCase = new PromoteRelayUseCase(
      new FakePromoteSessions(),
      new FakeNodes(),
      new FakeIdentities(),
      new FakeStore(),
      new FakeMachineConfig(),
      new FakeDataPack(),
      users,
      memberships,
      sessions,
      new FakeTicketKeys(),
    );

    const slice = useCase.exportIdentitySlice('org-1');
    expect(slice.memberships).toEqual([
      {
        userId: 'u1',
        orgId: 'org-1',
        capabilities: ['desk.write'],
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
      { userId: 'u2', orgId: 'org-1', capabilities: [], updatedAt: '2026-10-11T00:00:00.000Z' },
    ]);
    expect(slice.users.map((user) => user.id)).toEqual(['u1', 'u2']);

    useCase.importIdentitySlice(slice);
    expect(users.findById('u1')?.id).toBe('u1');
    expect(sessions.rows.find((row) => row.id === 's-1')?.revokedReason).toBe('promote');
    expect(sessions.rows.find((row) => row.id === 's-1')?.revokedAt).not.toBeNull();
    expect(sessions.rows.find((row) => row.id === 's-1')?.revokedAt).not.toBeUndefined();
    expect(sessions.rows.find((row) => row.id === 's-2')?.revokedAt).toBeNull();
    expect(sessions.rows.find((row) => row.id === 's-2')?.revokedReason).toBeNull();
  });
});
