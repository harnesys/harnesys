import { describe, expect, test } from 'bun:test';
import { toSourceWatchEvent } from './files-watcher-source-bridge.ts';

describe('toSourceWatchEvent', () => {
  test('git-dir events map to kind git, others to fs with rel path', () => {
    expect(toSourceWatchEvent({ kind: 'change', dir: '.git', name: 'HEAD' })).toEqual({
      kind: 'git',
      changedPath: '.git/HEAD',
    });
    expect(toSourceWatchEvent({ kind: 'create', dir: 'docs', name: 'a.md' })).toEqual({
      kind: 'fs',
      changedPath: 'docs/a.md',
    });
    expect(toSourceWatchEvent({ kind: 'delete', dir: '', name: 'b.txt' })).toEqual({
      kind: 'fs',
      changedPath: 'b.txt',
    });
  });
});
