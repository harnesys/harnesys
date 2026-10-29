import { describe, expect, test } from 'bun:test';
import {
  appendConflictPath,
  applyCloudSyncOutcome,
  siblingRefreshFlag,
} from './cloud-materialization-state.ts';

describe('cloud materialization state helpers', () => {
  test('keep-both appends conflict path and stays ready', () => {
    expect(
      applyCloudSyncOutcome(
        {
          state: 'ready',
          lastConflictPaths: [],
          errorCode: null,
          refreshRequired: false,
        },
        'keep-both',
        'notes (conflict, 2026).md',
      ),
    ).toEqual({
      state: 'ready',
      lastConflictPaths: ['notes (conflict, 2026).md'],
      errorCode: null,
      refreshRequired: false,
    });
  });

  test('revision-unknown fails until refresh', () => {
    expect(
      applyCloudSyncOutcome(
        {
          state: 'ready',
          lastConflictPaths: ['kept.md'],
          errorCode: null,
          refreshRequired: false,
        },
        'revision-unknown',
      ),
    ).toEqual({
      state: 'failed',
      lastConflictPaths: ['kept.md'],
      errorCode: 'CLOUD_REVISION_UNKNOWN',
      refreshRequired: true,
    });
  });

  test('folder and delete sync outcomes clear refresh errors', () => {
    const current = {
      state: 'ready' as const,
      lastConflictPaths: [],
      errorCode: 'CLOUD_SYNC_FAILED',
      refreshRequired: true,
    };
    expect(applyCloudSyncOutcome(current, 'folder-created')).toEqual({
      state: 'ready',
      lastConflictPaths: [],
      errorCode: null,
      refreshRequired: false,
    });
    expect(applyCloudSyncOutcome(current, 'deleted')).toEqual({
      state: 'ready',
      lastConflictPaths: [],
      errorCode: null,
      refreshRequired: false,
    });
  });

  test('appendConflictPath dedupes and sibling flag skips synced host', () => {
    expect(appendConflictPath(['a.md'], 'a.md')).toEqual(['a.md']);
    expect(appendConflictPath(['a.md'], 'b.md')).toEqual(['a.md', 'b.md']);
    expect(siblingRefreshFlag('host-a', 'host-a')).toBe(false);
    expect(siblingRefreshFlag('host-b', 'host-a')).toBe(true);
  });
});
