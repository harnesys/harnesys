import { describe, expect, test } from 'bun:test';
import { threadRuntimeContextOf } from './thread-runtime-context.ts';

describe('threadRuntimeContextOf', () => {
  test('derives primary directory and kind for every variant and passes shared sources through', () => {
    const sharedSources = [
      { id: 'src-1', name: 'repo', description: 'main repository' },
      { id: 'src-2', name: 'docs', description: null },
    ];

    const sandbox = threadRuntimeContextOf({
      hostId: 'host-1',
      runtime: 'host',
      threadSandbox: '/tmp/threads/t1/sandbox',
      sharedSources,
    });
    expect(sandbox.primaryDirectory).toBe('/tmp/threads/t1/sandbox');
    expect(sandbox.primaryKind).toBe('sandbox');
    expect(sandbox.activeWorktree).toBeUndefined();
    expect(sandbox.sharedSources).toBe(sharedSources);
    expect(sharedSources[0]?.description).toBe('main repository');
    expect(sharedSources[1]?.description).toBeNull();

    const primary = threadRuntimeContextOf({
      hostId: 'host-1',
      runtime: 'host',
      threadSandbox: '/tmp/threads/t1/sandbox',
      primary: { directory: '/srv/project', kind: 'directory' },
      sharedSources: [],
    });
    expect(primary.primaryDirectory).toBe('/srv/project');
    expect(primary.primaryKind).toBe('directory');
    expect(primary.threadSandbox).toBe('/tmp/threads/t1/sandbox');
    expect(primary.activeWorktree).toBeUndefined();

    const worktreeInput = {
      worktreeId: 'wt-1',
      sourceId: 'src-1',
      hostId: 'host-1',
      root: '/tmp/sources/src-1.worktrees/wt-1',
    };
    const worktree = threadRuntimeContextOf({
      hostId: 'host-1',
      runtime: 'container',
      threadSandbox: '/tmp/threads/t1/sandbox',
      worktree: worktreeInput,
      sharedSources: [],
    });
    expect(worktree.primaryDirectory).toBe(worktreeInput.root);
    expect(worktree.primaryKind).toBe('worktree');
    expect(worktree.activeWorktree).toBe(worktreeInput);
    expect(worktree.runtime).toBe('container');

    const fallback = threadRuntimeContextOf({
      hostId: 'host-1',
      runtime: 'host',
      threadSandbox: '/tmp/threads/t1/sandbox',
      sharedSources: [],
    });
    expect(fallback.primaryKind).toBe('sandbox');
    expect(fallback.primaryDirectory).toBe('/tmp/threads/t1/sandbox');
  });

  test('bound source material becomes source primary and keeps the context ref without root', () => {
    const source = threadRuntimeContextOf({
      hostId: 'host-1',
      runtime: 'host',
      threadSandbox: '/tmp/threads/t1/sandbox',
      primarySource: { sourceId: 'src-1', name: 'repo', kind: 'git', root: '/sources/repo' },
      sharedSources: [],
    });
    expect(source.primaryDirectory).toBe('/sources/repo');
    expect(source.primaryKind).toBe('source');
    expect(source.primarySource).toEqual({ sourceId: 'src-1', name: 'repo', kind: 'git' });
    expect(source.activeWorktree).toBeUndefined();
  });
});
