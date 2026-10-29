import { describe, expect, test } from 'bun:test';
import { resolveStandaloneRepoRoot } from './resolve-git-worktree.ts';

const base = {
  sourceId: 'src-1',
  hostId: 'host-1',
  managedBarePath: '/data/orgs/o/sources/src-1',
};

describe('resolveStandaloneRepoRoot', () => {
  test('managed origin uses the bare clone path', () => {
    expect(
      resolveStandaloneRepoRoot({
        ...base,
        origin: 'managed',
        localPath: '/Users/u/Desktop/vite-app',
      }),
    ).toBe('/data/orgs/o/sources/src-1');
  });

  test('attached origin uses the materialized repo path', () => {
    expect(
      resolveStandaloneRepoRoot({
        ...base,
        origin: 'attached',
        localPath: '/Users/u/Desktop/vite-app',
      }),
    ).toBe('/Users/u/Desktop/vite-app');
  });

  test('attached origin without local path throws materialization-absent', () => {
    expect(() =>
      resolveStandaloneRepoRoot({ ...base, origin: 'attached', localPath: null }),
    ).toThrow('src-1');
  });
});
