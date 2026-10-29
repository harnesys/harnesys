import { describe, expect, test } from 'bun:test';
import { decideSnapshotApply, isReplicaReadyForRevision } from './org-execution-snapshot.apply.ts';

describe('decideSnapshotApply', () => {
  test('accepts schemaVersion 1 snapshot', () => {
    const decision = decideSnapshotApply({
      schemaVersion: 1,
      revision: 3,
      agents: [],
      sources: [],
      providers: [],
      models: [],
      runtime: { skillsSourceAutoLoad: true, timezone: 'UTC', browser: { defaultEngine: 'auto' } },
    });
    expect(decision.status).toBe('accepted');
    expect(decision.revision).toBe(3);
    expect(decision.snapshot?.revision).toBe(3);
  });

  test('refuses incompatible schemaVersion', () => {
    const decision = decideSnapshotApply({
      schemaVersion: 99,
      revision: 2,
      agents: [],
      sources: [],
      providers: [],
      models: [],
      runtime: { skillsSourceAutoLoad: true, timezone: 'UTC', browser: { defaultEngine: 'auto' } },
    });
    expect(decision.status).toBe('incompatible');
    expect(decision.revision).toBe(2);
    expect(decision.snapshot).toBeNull();
  });

  test('ready only when accepted revision matches', () => {
    expect(isReplicaReadyForRevision({ revision: 4, status: 'accepted' }, 4)).toBe(true);
    expect(isReplicaReadyForRevision({ revision: 4, status: 'accepted' }, 3)).toBe(false);
    expect(isReplicaReadyForRevision({ revision: 4, status: 'incompatible' }, 4)).toBe(false);
    expect(isReplicaReadyForRevision(null, 1)).toBe(false);
  });
});
