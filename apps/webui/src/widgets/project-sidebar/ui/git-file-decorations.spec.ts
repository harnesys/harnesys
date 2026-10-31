import { describe, expect, test } from 'bun:test';
import { getDirAggregatedStatus } from './git-file-decorations';

describe('getDirAggregatedStatus', () => {
  test('ignored-only children do not color the parent dir', () => {
    const map = {
      'apps/.DS_Store': 'ignored',
      'apps/server/.env': 'ignored',
      'apps/server/node_modules/x': 'ignored',
    } as const;
    expect(getDirAggregatedStatus('apps', map)).toBeUndefined();
    expect(getDirAggregatedStatus('apps/server', map)).toBeUndefined();
  });

  test('real statuses still win over nothing and outrank each other', () => {
    const map = {
      'apps/a.ts': 'modified',
      'apps/b.ts': 'untracked',
    } as const;
    expect(getDirAggregatedStatus('apps', map)).toBe('modified');
    expect(getDirAggregatedStatus('lint', { 'lint/x.ts': 'untracked' } as const)).toBe('untracked');
  });

  test('ignored entries are skipped even when mixed with real ones', () => {
    const map = {
      'pkg/.DS_Store': 'ignored',
      'pkg/sub/.env': 'ignored',
      'pkg/sub/real.ts': 'untracked',
    } as const;
    expect(getDirAggregatedStatus('pkg', map)).toBe('untracked');
    expect(getDirAggregatedStatus('pkg/sub', map)).toBe('untracked');
  });
});
