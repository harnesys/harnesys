import { describe, expect, test } from 'bun:test';
import { DEFAULT_PATH_BLOCKLIST } from '../../constants.ts';
import { isPathBlocked } from './path-blocklist.ts';

describe('isPathBlocked with DEFAULT_PATH_BLOCKLIST', () => {
  test.each([
    '/repo/.env',
    '/repo/.env.local',
    '/repo/.env.production',
    '/repo/.env.example',
    '/repo/sub/.env',
    '/repo/sub/.env.local',
    '/repo/.npmrc',
    '/repo/sub/.npmrc',
    '/repo/.netrc',
    '/repo/.git-credentials',
    '/home/u/.kube/config',
    '/home/u/.docker/config.json',
    '/repo/certs/server.p12',
    '/repo/certs/server.pfx',
  ])('blocks %s', (p) => {
    expect(isPathBlocked(p, DEFAULT_PATH_BLOCKLIST)).toBe(true);
  });

  test('does not block unrelated files', () => {
    expect(isPathBlocked('/repo/src/env.ts', DEFAULT_PATH_BLOCKLIST)).toBe(false);
    expect(isPathBlocked('/repo/environment.md', DEFAULT_PATH_BLOCKLIST)).toBe(false);
  });
});
