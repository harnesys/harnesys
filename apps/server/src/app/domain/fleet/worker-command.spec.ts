import { describe, expect, test } from 'bun:test';
import { isQueueableCommand, type WorkerCommand } from './worker-command.ts';

describe('isQueueableCommand', () => {
  test('queues SOURCE_MATERIALIZE, SOURCE_ATTACH and SOURCE_REFRESH', () => {
    const materialize: WorkerCommand = {
      type: 'SOURCE_MATERIALIZE',
      operationId: 'op-1',
      sourceId: 'src-1',
      sourceRevision: 3,
      projectionRevision: 4,
      worktreeId: 'wt-1',
    };
    const attach: WorkerCommand = {
      type: 'SOURCE_ATTACH',
      operationId: 'op-attach',
      sourceId: 'src-1',
      localPath: '/Users/me/project',
      revision: 1,
    };
    const refresh: WorkerCommand = {
      type: 'SOURCE_REFRESH',
      operationId: 'op-2',
      sourceId: 'src-1',
      sourceRevision: 3,
      projectionRevision: 4,
      worktreeId: 'wt-1',
    };
    expect(isQueueableCommand(materialize)).toBe(true);
    expect(isQueueableCommand(attach)).toBe(true);
    expect(isQueueableCommand(refresh)).toBe(true);
    expect(
      isQueueableCommand({
        type: 'SOURCE_WORKTREE_CREATE',
        operationId: 'op-3',
        sourceId: 'src-1',
        sourceRevision: 3,
        worktreeId: 'wt-2',
        branch: 'feature',
        createBranch: false,
      }),
    ).toBe(true);
  });

  test('does not queue HTTP_PROXY or NODE_DRAIN', () => {
    expect(
      isQueueableCommand({
        type: 'HTTP_PROXY',
        requestId: 'r1',
        method: 'POST',
        path: '/x',
      }),
    ).toBe(false);
    expect(isQueueableCommand({ type: 'NODE_DRAIN' })).toBe(false);
  });
});
