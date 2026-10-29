import { describe, expect, test } from 'bun:test';
import { mergeSourceHostStatus } from './source-host-status.ts';

describe('mergeSourceHostStatus', () => {
  test('absent when no materialization view', () => {
    expect(mergeSourceHostStatus('host-1', 'online', null)).toEqual({
      hostId: 'host-1',
      nodeStatus: 'online',
      materialization: 'absent',
      lastConfirmedAt: null,
      errorCode: null,
      stale: false,
      defaultWorktreeId: null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
  });

  test('keeps last ready state stale when node offline', () => {
    expect(
      mergeSourceHostStatus('host-2', 'offline', {
        state: 'ready',
        lastConfirmedAt: '2026-01-01T00:00:00.000Z',
        errorCode: null,
        defaultWorktreeId: 'wt-1',
        lastConflictPaths: ['a (conflict).md'],
        refreshRequired: true,
      }),
    ).toEqual({
      hostId: 'host-2',
      nodeStatus: 'offline',
      materialization: 'ready',
      lastConfirmedAt: '2026-01-01T00:00:00.000Z',
      errorCode: null,
      stale: true,
      defaultWorktreeId: 'wt-1',
      lastConflictPaths: ['a (conflict).md'],
      refreshRequired: true,
    });
  });

  test('online ready is not stale and keeps errorCode', () => {
    expect(
      mergeSourceHostStatus('host-3', 'online', {
        state: 'failed',
        lastConfirmedAt: '2026-02-01T00:00:00.000Z',
        errorCode: 'CLONE_FAILED',
      }),
    ).toEqual({
      hostId: 'host-3',
      nodeStatus: 'online',
      materialization: 'failed',
      lastConfirmedAt: '2026-02-01T00:00:00.000Z',
      errorCode: 'CLONE_FAILED',
      stale: false,
      defaultWorktreeId: null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
  });
});
