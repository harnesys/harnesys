import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityLinkConflictException } from '../../domain/identity/identity.error.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { IdentityLinkAdapter } from './identity-link.adapter.ts';
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

function seedUser(id: string): void {
  new UserRepositoryAdapter(layout()).insert({
    id,
    login: id,
    name: id,
    passwordHash: 'hash',
    createdAt: new Date().toISOString(),
  });
}

describe('IdentityLinkAdapter', () => {
  beforeEach(() => {
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
    home = mkdtempSync(join(tmpdir(), 'harnesys-link-'));
    seedUser('user-1');
    seedUser('user-2');
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('links a provider identity and resolves it both ways', () => {
    const links = new IdentityLinkAdapter(layout());
    const at = new Date().toISOString();
    links.link({ userId: 'user-1', provider: 'telegram', providerUserId: '42', at });

    expect(links.findByIdentity('telegram', '42')?.userId).toBe('user-1');
    expect(links.findForUser('user-1', 'telegram')?.providerUserId).toBe('42');
    expect(links.listByUser('user-1')).toHaveLength(1);
  });

  test('stores the provider profile label with the link', () => {
    const links = new IdentityLinkAdapter(layout());
    const at = new Date().toISOString();
    links.link({
      userId: 'user-1',
      provider: 'telegram',
      providerUserId: '42',
      displayName: 'Alice Adams',
      handle: 'alice',
      at,
    });

    const found = links.findForUser('user-1', 'telegram');
    expect(found?.displayName).toBe('Alice Adams');
    expect(found?.handle).toBe('alice');

    links.link({
      userId: 'user-1',
      provider: 'telegram',
      providerUserId: '42',
      displayName: 'Alice A.',
      handle: 'alice_new',
      at,
    });

    const updated = links.findForUser('user-1', 'telegram');
    expect(updated?.displayName).toBe('Alice A.');
    expect(updated?.handle).toBe('alice_new');
  });

  test('relinks the same user and replays the previous provider id', () => {
    const links = new IdentityLinkAdapter(layout());
    const at = new Date().toISOString();
    links.link({ userId: 'user-1', provider: 'telegram', providerUserId: '42', at });
    links.link({ userId: 'user-1', provider: 'telegram', providerUserId: '43', at });

    expect(links.findForUser('user-1', 'telegram')?.providerUserId).toBe('43');
    expect(links.findByIdentity('telegram', '42')).toBeNull();
  });

  test('rejects linking one provider identity to two users', () => {
    const links = new IdentityLinkAdapter(layout());
    const at = new Date().toISOString();
    links.link({ userId: 'user-1', provider: 'telegram', providerUserId: '42', at });

    expect(() =>
      links.link({ userId: 'user-2', provider: 'telegram', providerUserId: '42', at }),
    ).toThrow(IdentityLinkConflictException);
  });

  test('link code is single use and expires', () => {
    const links = new IdentityLinkAdapter(layout());
    const now = new Date().toISOString();
    links.issueCode({
      userId: 'user-1',
      provider: 'telegram',
      codeHash: 'hash-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      at: now,
    });
    expect(links.consumeCode({ provider: 'telegram', codeHash: 'hash-1', at: now })).toEqual({
      userId: 'user-1',
    });
    expect(links.consumeCode({ provider: 'telegram', codeHash: 'hash-1', at: now })).toBeNull();

    links.issueCode({
      userId: 'user-1',
      provider: 'telegram',
      codeHash: 'hash-2',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      at: now,
    });
    expect(links.consumeCode({ provider: 'telegram', codeHash: 'hash-2', at: now })).toBeNull();
  });

  test('issuing a code replaces the previous code for the same provider', () => {
    const links = new IdentityLinkAdapter(layout());
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    links.issueCode({
      userId: 'user-1',
      provider: 'telegram',
      codeHash: 'hash-1',
      expiresAt,
      at: now,
    });
    links.issueCode({
      userId: 'user-1',
      provider: 'telegram',
      codeHash: 'hash-2',
      expiresAt,
      at: now,
    });

    expect(links.consumeCode({ provider: 'telegram', codeHash: 'hash-1', at: now })).toBeNull();
    expect(links.consumeCode({ provider: 'telegram', codeHash: 'hash-2', at: now })).toEqual({
      userId: 'user-1',
    });
  });

  test('unlink removes the link', () => {
    const links = new IdentityLinkAdapter(layout());
    const at = new Date().toISOString();
    links.link({ userId: 'user-1', provider: 'telegram', providerUserId: '42', at });
    links.unlink('user-1', 'telegram');

    expect(links.findByIdentity('telegram', '42')).toBeNull();
  });
});
