import { describe, expect, test } from 'bun:test';
import { authorize } from './authorize.ts';
import { ROLE_PRESETS } from './role-presets.ts';

const user = (capabilities: string[], orgId = 'org-1') => ({
  kind: 'user' as const,
  userId: 'u-1',
  capabilities,
  orgId,
});

const node = (orgId = 'org-1') => ({ kind: 'node' as const, nodeId: 'n-1', orgId });

describe('authorize', () => {
  test('unknown action denies even owner', () => {
    expect(authorize(user(ROLE_PRESETS.owner), 'org.purge', { orgId: 'org-1' })).toBe(false);
  });

  test('operator and viewer lack privileged capabilities', () => {
    const operator = user(ROLE_PRESETS.operator);
    expect(authorize(operator, 'secret.read', { orgId: 'org-1' })).toBe(false);
    expect(authorize(operator, 'fleet.invite', { orgId: 'org-1' })).toBe(false);
    expect(authorize(operator, 'member.invite', { orgId: 'org-1' })).toBe(false);
    expect(authorize(operator, 'host.promote', { orgId: 'org-1' })).toBe(false);
    const viewer = user(ROLE_PRESETS.viewer);
    expect(authorize(viewer, 'desk.write', { orgId: 'org-1' })).toBe(false);
  });

  test('node principal passes only machine actions', () => {
    expect(authorize(node(), 'heartbeat')).toBe(true);
    expect(authorize(node(), 'work.claim')).toBe(true);
    expect(authorize(node(), 'fleet.channel')).toBe(true);
    expect(authorize(node(), 'source.materialize')).toBe(true);
    expect(authorize(node(), 'run.execute')).toBe(true);
    expect(authorize(node(), 'desk.read')).toBe(false);
    expect(authorize(node('org-2'), 'heartbeat', { orgId: 'org-1' })).toBe(false);
  });
});
