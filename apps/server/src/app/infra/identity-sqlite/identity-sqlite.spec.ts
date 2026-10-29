import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SessionStoreAdapter } from './session-repository.adapter.ts';
import { UserRepositoryAdapter } from './user-repository.adapter.ts';

let home = '';

function layout(): HostFsLayoutPort {
  return {
    identityDbPath: () => join(home, 'identity.db'),
    ensureHome: () => {
      mkdirSync(home, { recursive: true });
    },
  } as HostFsLayoutPort;
}

describe('identity sqlite adapters', () => {
  beforeEach(() => {
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
    home = mkdtempSync(join(tmpdir(), 'harnesys-identity-'));
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('user insert, findByLogin and count roundtrip', () => {
    const repository = new UserRepositoryAdapter(layout());
    const createdAt = new Date().toISOString();
    repository.insert({
      id: randomUUID(),
      login: 'ann',
      name: 'Ann',
      passwordHash: 'hash-1',
      createdAt,
    });
    const found = repository.findByLogin('ann');
    expect(found?.name).toBe('Ann');
    expect(repository.count()).toBe(1);
    expect(repository.findByLogin('missing')).toBeNull();
  });

  test('session rotate consumes old refresh hash and revokeFamily silences', () => {
    const store = new SessionStoreAdapter(layout());
    const now = new Date().toISOString();
    store.createFamily({
      id: 's1',
      familyId: 'f1',
      userId: 'u1',
      orgId: 'org-1',
      refreshHash: 'r1',
      accessHash: 'a1',
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now,
      absoluteExpiresAt: now,
    });
    store.rotate(
      {
        id: 's2',
        familyId: 'f1',
        userId: 'u1',
        orgId: 'org-1',
        refreshHash: 'r2',
        accessHash: 'a2',
        lastUsedAt: now,
        expiresAt: now,
        absoluteExpiresAt: now,
      },
      'r1',
    );
    expect(store.findByRefreshHash('r2')?.id).toBe('s2');
    expect(store.findConsumedRefresh('r1')?.familyId).toBe('f1');
    expect(store.findByRefreshHash('r1')).toBeNull();
    store.revokeFamily('f1', now, 'reuse');
    expect(store.findByRefreshHash('r2')?.revokedReason).toBe('reuse');
  });
});
