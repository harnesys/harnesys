import { describe, expect, test } from 'bun:test';
import type { CanonicalAuthor } from '../../domain/connector/telegram-update.ts';
import type { IdentityLinkRecord } from '../../domain/identity/identity-link.port.ts';
import type { UserRecord } from '../../domain/identity/user-repository.port.ts';
import { linkedAuthorOf } from './apply-telegram-actions.ts';

const AUTHOR: CanonicalAuthor = { userId: '77', displayName: 'Alice', username: 'alice' };

function link(overrides: Partial<IdentityLinkRecord> = {}): IdentityLinkRecord {
  return {
    userId: 'user-1',
    provider: 'telegram',
    providerUserId: '77',
    displayName: 'Alice',
    handle: 'alice',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function user(name: string): UserRecord {
  return {
    id: 'user-1',
    login: 'alice',
    name,
    passwordHash: 'hash',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('linkedAuthorOf', () => {
  test('attributes a linked author to the app user', () => {
    expect(linkedAuthorOf(link(), user('Alice Smith'), AUTHOR)).toEqual({
      attribution: { startedByUserId: 'user-1', via: 'agent' },
      displayName: 'Alice Smith',
    });
  });

  test('falls back to the telegram display name when the user is missing', () => {
    expect(linkedAuthorOf(link(), null, AUTHOR)).toEqual({
      attribution: { startedByUserId: 'user-1', via: 'agent' },
      displayName: 'Alice',
    });
  });

  test('returns null without a link', () => {
    expect(linkedAuthorOf(null, user('Alice Smith'), AUTHOR)).toBeNull();
  });
});
