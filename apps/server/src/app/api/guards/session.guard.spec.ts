import { describe, expect, test } from 'bun:test';
import { localOpsCredentialParam } from './session.guard.ts';

describe('local ops ticket routes', () => {
  test('materialize routes are ticket-eligible', () => {
    expect(localOpsCredentialParam('/api/orgs/o-1/sources', 'POST')).toBe('ticket');
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/s-1/prepare', 'POST')).toBe('ticket');
  });

  test('git credential route is key-eligible', () => {
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/s-1/git-credential', 'GET')).toBe('key');
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/s-1/git-credential', 'POST')).toBe(null);
  });

  test('other source routes stay session-only', () => {
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/s-1/prepare', 'GET')).toBe(null);
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/git', 'POST')).toBe(null);
    expect(localOpsCredentialParam('/api/orgs/o-1/sources/s-1/refresh', 'POST')).toBe(null);
    expect(localOpsCredentialParam('/api/orgs/o-1/sources', 'DELETE')).toBe(null);
  });
});
