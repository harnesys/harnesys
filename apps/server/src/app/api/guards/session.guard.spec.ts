import { describe, expect, test } from 'bun:test';
import { isLocalOpsTicketRoute } from './session.guard.ts';

describe('local ops ticket routes', () => {
  test('materialize routes are ticket-eligible', () => {
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources', 'POST')).toBe(true);
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources/s-1/prepare', 'POST')).toBe(true);
  });

  test('other source routes stay session-only', () => {
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources/s-1/prepare', 'GET')).toBe(false);
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources/git', 'POST')).toBe(false);
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources/s-1/refresh', 'POST')).toBe(false);
    expect(isLocalOpsTicketRoute('/api/orgs/o-1/sources', 'DELETE')).toBe(false);
  });
});
