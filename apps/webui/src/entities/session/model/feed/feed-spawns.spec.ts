import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { createSpawnFold, spawnProcess, spawnProcessOwned, spawnSnapshot } from './feed-spawns';

function spawned(): SessionEvent {
  return {
    type: 'agent.spawned',
    agentId: 'agent-1',
    agentName: 'Worker',
    spawnId: 'spawn-1',
    taskInput: 'do work',
  };
}

describe('spawn fold ownership', () => {
  test('settles an owned child on done and keeps the spawned agent name', () => {
    const fold = createSpawnFold();
    spawnProcess(fold, spawned(), undefined);
    spawnProcessOwned(fold, { type: 'done', text: 'ok', runId: 'spawn-1' }, 'spawn-1', undefined);
    const [spawn] = spawnSnapshot(fold);
    expect(spawn?.status).toBe('done');
    expect(spawn?.agentName).toBe('Worker');
  });

  test('settles an owned child on error', () => {
    const fold = createSpawnFold();
    spawnProcess(fold, spawned(), undefined);
    spawnProcessOwned(
      fold,
      { type: 'error', code: 'cancelled', message: 'run cancelled', runId: 'spawn-1' },
      'spawn-1',
      undefined,
    );
    expect(spawnSnapshot(fold)[0]?.status).toBe('failed');
  });

  test('settles an owned child on raw lifecycle terminal events', () => {
    const completed = createSpawnFold();
    spawnProcess(completed, spawned(), undefined);
    spawnProcessOwned(completed, { type: 'run.completed', runId: 'spawn-1' }, 'spawn-1', undefined);
    expect(spawnSnapshot(completed)[0]?.status).toBe('done');

    const cancelled = createSpawnFold();
    spawnProcess(cancelled, spawned(), undefined);
    spawnProcessOwned(
      cancelled,
      { type: 'run.cancelled', reason: 'run cancelled', runId: 'spawn-1' },
      'spawn-1',
      undefined,
    );
    expect(spawnSnapshot(cancelled)[0]?.status).toBe('failed');
  });
});
