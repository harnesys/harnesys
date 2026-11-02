import { describe, expect, test } from 'bun:test';
import { createProcessJobRegistry } from './process-job-registry.ts';

describe('process job registry named sessions', () => {
  test('getByName resolves sessions per org and rejects duplicates', () => {
    const registry = createProcessJobRegistry();
    const record = registry.start({
      cwd: '/tmp',
      command: 'true',
      mode: 'pipes',
      orgId: 'org-1',
      name: 'main',
      origin: 'agent',
    });
    expect(record.name).toBe('main');
    expect(registry.getByName('org-1', 'main')?.id).toBe(record.id);
    expect(registry.getByName('org-2', 'main')).toBeNull();
    expect(() =>
      registry.start({ cwd: '/tmp', command: 'true', mode: 'pipes', orgId: 'org-1', name: 'main' }),
    ).toThrow('session name already in use');
    expect(() =>
      registry.start({ cwd: '/tmp', command: 'true', mode: 'pipes', orgId: 'org-2', name: 'main' }),
    ).not.toThrow();
  });

  test('delete frees the name for reuse', () => {
    const registry = createProcessJobRegistry();
    const record = registry.start({
      cwd: '/tmp',
      command: 'true',
      mode: 'pipes',
      orgId: 'org-1',
      name: 'svc',
    });
    expect(registry.delete(record.id)).toBe(true);
    expect(registry.getByName('org-1', 'svc')).toBeNull();
    const again = registry.start({
      cwd: '/tmp',
      command: 'true',
      mode: 'pipes',
      orgId: 'org-1',
      name: 'svc',
    });
    expect(again.name).toBe('svc');
  });

  test('rename updates title and name and frees the previous name', () => {
    const registry = createProcessJobRegistry();
    const record = registry.start({
      cwd: '/tmp',
      command: 'true',
      mode: 'pipes',
      orgId: 'org-1',
      name: 'old',
      title: 'old',
    });
    expect(registry.rename(record.id, 'renamed')).toBe(true);
    expect(registry.get(record.id)?.title).toBe('renamed');
    expect(registry.get(record.id)?.name).toBe('renamed');
    expect(registry.getByName('org-1', 'renamed')?.id).toBe(record.id);
    expect(registry.getByName('org-1', 'old')).toBeNull();
  });

  test('rename rejects duplicate names within the same org', () => {
    const registry = createProcessJobRegistry();
    registry.start({ cwd: '/tmp', command: 'true', mode: 'pipes', orgId: 'org-1', name: 'taken' });
    const other = registry.start({ cwd: '/tmp', command: 'true', mode: 'pipes', orgId: 'org-1' });
    expect(() => registry.rename(other.id, 'taken')).toThrow('session name already in use');
    expect(registry.rename('missing', 'any')).toBe(false);
  });

  test('reapOrg kills running jobs and keeps other orgs untouched', () => {
    const registry = createProcessJobRegistry();
    const mine = registry.start({
      cwd: '/tmp',
      command: 'sleep 30',
      mode: 'pipes',
      orgId: 'org-1',
    });
    const theirs = registry.start({
      cwd: '/tmp',
      command: 'sleep 30',
      mode: 'pipes',
      orgId: 'org-2',
    });
    const reaped = registry.reapOrg('org-1');
    expect(reaped).toBe(1);
    expect(registry.get(mine.id)).toBeNull();
    expect(registry.get(theirs.id)?.status).toBe('running');
    registry.kill(theirs.id);
  });

  test('origin defaults are preserved on records', () => {
    const registry = createProcessJobRegistry();
    const record = registry.start({
      cwd: '/tmp',
      command: 'true',
      mode: 'pipes',
      orgId: 'org-1',
      origin: 'user',
      threadId: 'thr-1',
    });
    expect(record.origin).toBe('user');
    expect(record.threadId).toBe('thr-1');
  });
});
