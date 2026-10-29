import { describe, expect, test } from 'bun:test';
import { comparePendingPaths } from './cloud-sync-back-queue.ts';
import { coalescePaths } from './cloud-sync-back-watcher.ts';

describe('coalescePaths', () => {
  test('returns only paths quiet past the debounce and drains them', () => {
    const pending = new Map<string, number>([
      ['src:a.md', 1_000],
      ['src:b.md', 3_500],
      ['src:c.md', 3_600],
    ]);
    const due = coalescePaths(pending, 3_600, 2_000);
    expect(due).toEqual(['src:a.md']);
    expect(pending.has('src:a.md')).toBe(false);
    expect(pending.has('src:b.md')).toBe(true);
    expect(pending.has('src:c.md')).toBe(true);
  });
});

describe('comparePendingPaths', () => {
  test('creates parent folders before children and removes children before parents', () => {
    const creates = new Map([
      ['src:folder', 'create' as const],
      ['src:folder/file.txt', 'create' as const],
    ]);
    const deletes = new Map([
      ['src:folder', 'delete' as const],
      ['src:folder/file.txt', 'delete' as const],
    ]);
    expect(comparePendingPaths(creates, 'src:folder', 'src:folder/file.txt')).toBeLessThan(0);
    expect(comparePendingPaths(deletes, 'src:folder/file.txt', 'src:folder')).toBeLessThan(0);
  });
});
