import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { build, currentBaseDir, disposeBaseDir } from './prepare-org-target.fixtures.ts';
import { prepareTarget } from './prepare-org-target.ts';

afterEach(() => {
  disposeBaseDir();
});

describe('prepareTarget runtime context', () => {
  test('derives cwd and primaryKind per trigger and keeps shared sources out of paths.allow', () => {
    const chat = build(undefined, undefined, ['src-1']);
    const chatThreadDir = join(currentBaseDir(), 'org-1', 'thread-1');
    const chatSandbox = join(chatThreadDir, 'sandbox');
    const chatPrepared = prepareTarget(chat.deps, 'thread-1', chat.cache);
    expect(chatPrepared?.runtime.primaryKind).toBe('sandbox');
    expect(chatPrepared?.runtime.primaryDirectory).toBe(chatSandbox);
    expect(chatPrepared?.runtime.threadSandbox).toBe(chatSandbox);
    expect(chatPrepared?.paths.cwd).toBe(chatSandbox);
    expect(chatPrepared?.paths.threadDir).toBe(chatThreadDir);
    expect(chatPrepared?.paths.allow).toEqual([join(chatThreadDir, 'attachments'), chatSandbox]);
    expect(chatPrepared?.paths.write).toEqual([chatSandbox]);
    expect(chatPrepared?.runtime.hostId).toBe('host-1');
    expect(chatPrepared?.runtime.runtime).toBe('host');
    expect(chatPrepared?.runtime.activeWorktree).toBeUndefined();

    const scheduled = build(undefined, undefined, ['src-1']);
    const scheduledSandbox = join(currentBaseDir(), 'org-1', 'thread-1', 'sandbox');
    const scheduledPrepared = prepareTarget(scheduled.deps, 'thread-1', scheduled.cache, {
      triggerKind: 'schedule',
    });
    expect(scheduledPrepared?.runtime.primaryKind).toBe('sandbox');
    expect(scheduledPrepared?.runtime.primaryDirectory).toBe(scheduledSandbox);
    expect(scheduledPrepared?.paths.cwd).toBe(scheduledSandbox);

    const directory = build(undefined, undefined, ['src-1']);
    const directoryRoot = currentBaseDir();
    const directoryPrepared = prepareTarget(directory.deps, 'thread-1', directory.cache, {
      directory: directoryRoot,
    });
    expect(directoryPrepared?.runtime.primaryKind).toBe('directory');
    expect(directoryPrepared?.runtime.primaryDirectory).toBe(directoryRoot);
    expect(directoryPrepared?.paths.cwd).toBe(directoryRoot);

    const worktree = build('issue', undefined, ['src-1']);
    const worktreeRoot = currentBaseDir();
    const worktreePrepared = prepareTarget(worktree.deps, 'thread-1', worktree.cache, {
      triggerKind: 'issue',
      sourceId: 'src-1',
      worktreeId: 'wt-1',
    });
    expect(worktreePrepared?.runtime.primaryKind).toBe('worktree');
    expect(worktreePrepared?.runtime.primaryDirectory).toBe(worktreeRoot);
    expect(worktreePrepared?.runtime.activeWorktree).toEqual({
      worktreeId: 'wt-1',
      sourceId: 'src-1',
      hostId: 'host-1',
      root: worktreeRoot,
    });
    expect(worktreePrepared?.paths.cwd).toBe(worktreeRoot);

    const issue = build('issue', undefined, ['src-1']);
    const issueSourceRoot = currentBaseDir();
    const issuePrepared = prepareTarget(issue.deps, 'thread-1', issue.cache, {
      triggerKind: 'issue',
      sourceId: 'src-1',
    });
    expect(issuePrepared?.runtime.primaryKind).toBe('source');
    expect(issuePrepared?.runtime.primaryDirectory).toBe(issueSourceRoot);
    expect(issuePrepared?.runtime.primarySource).toEqual({
      sourceId: 'src-1',
      name: 'src-1',
      kind: 'folder',
    });
    expect(issuePrepared?.paths.cwd).toBe(issueSourceRoot);

    for (const prepared of [
      chatPrepared,
      scheduledPrepared,
      directoryPrepared,
      worktreePrepared,
      issuePrepared,
    ]) {
      expect(prepared?.runtime.sharedSources).toHaveLength(1);
      expect(prepared?.runtime.sharedSources[0]?.description).toBeNull();
      expect(prepared?.scope.sourceIds).toEqual(['src-1']);
    }
    expect(chatPrepared?.paths.allow).toHaveLength(2);
    expect(chatPrepared?.paths.allow).not.toContain(join(currentBaseDir(), 'sources', 'src-1'));
  });
});
