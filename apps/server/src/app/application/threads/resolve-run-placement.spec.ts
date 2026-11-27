import { describe, expect, test } from 'bun:test';
import type {
  MaterializationState,
  RunEnvironment,
  RunEnvironmentAnchor,
} from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type { ExecutionProfileRecord } from '../../domain/execution-profile/execution-profile.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import {
  type MaterializationRecord,
  SourceMaterializationPort,
} from '../../domain/source/source-materialization.port.ts';
import { resolveRunPlacement } from './resolve-run-placement.ts';

const ORG = 'org-1';
const SOURCE = 'src-1';

const PROFILE: ExecutionProfileRecord = {
  id: 'prof-1',
  orgId: ORG,
  name: 'Standard',
  system: false,
  nodeIds: ['node-a', 'node-b'],
  isolation: 'host',
  dockerImage: null,
};

const WORKTREE: RepositoryWorktree = {
  id: 'wt-1',
  orgId: ORG,
  sourceId: SOURCE,
  hostId: 'node-b',
  branch: 'issue/1',
  baseCommit: null,
  state: 'ready',
  activeRunId: null,
  operationId: 'op-1',
  issueId: null,
  lastErrorCode: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function presenceNode(id: string): FleetPresenceNode {
  return {
    id,
    name: id,
    role: 'worker',
    status: 'online',
    lastSeenAt: '2026-10-22T00:00:00.000Z',
    enrolledAt: '2026-10-01T00:00:00.000Z',
    diskFreeBytes: 1_000_000,
    diskTotalBytes: 2_000_000,
    dockerAvailable: null,
  };
}

function materialization(hostId: string, state: MaterializationState): MaterializationRecord {
  return {
    orgId: ORG,
    sourceId: SOURCE,
    hostId,
    origin: 'managed',
    localPath: `/sources/${SOURCE}`,
    state,
    lastError: null,
    revision: 1,
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastConflictPaths: [],
    refreshRequired: false,
  };
}

class FakeProfiles extends ExecutionProfilePort {
  list(): [] {
    return [];
  }

  findById(_orgId: string, profileId: string): ExecutionProfileRecord | undefined {
    return profileId === PROFILE.id ? PROFILE : undefined;
  }

  findByName(): undefined {
    return undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  setNodes(): never {
    throw new Error('not used');
  }

  removeNodeFromAll(): void {}

  getDefault(): string | undefined {
    return PROFILE.id;
  }

  setDefault(): void {}

  delete(): void {}

  ensureLocalDefault(): never {
    throw new Error('not used');
  }

  countUsage(): never {
    throw new Error('not used');
  }
}

function fakeHub(nodes: FleetPresenceNode[]): FleetHubPort {
  const port: Pick<FleetHubPort, 'listPresence'> = { listPresence: () => nodes };
  return port as FleetHubPort;
}

class FakeClaims extends EventClaimPort {
  grant(): never {
    throw new Error('not used');
  }

  findByRun(): null {
    return null;
  }

  findActiveByNode(): [] {
    return [];
  }

  countActiveByNode(): number {
    return 0;
  }

  renew(): boolean {
    return false;
  }

  markDone(): boolean {
    return false;
  }

  findExpired(): [] {
    return [];
  }

  releaseExpired(): number {
    return 0;
  }
}

class FakeWorktrees extends RepositoryWorktreePort {
  findById(_orgId: string, worktreeId: string): RepositoryWorktree | null {
    return worktreeId === WORKTREE.id ? WORKTREE : null;
  }

  findByOperationId(): null {
    return null;
  }

  findActiveByBranch(): null {
    return null;
  }

  listCreating(): [] {
    return [];
  }

  listForSource(): [] {
    return [];
  }

  listForHost(): [] {
    return [];
  }

  listForIssue(): [] {
    return [];
  }

  upsert(): never {
    throw new Error('not used');
  }

  setState(): never {
    throw new Error('not used');
  }

  setActiveRunId(): never {
    throw new Error('not used');
  }

  clearActiveRun(): never {
    throw new Error('not used');
  }

  remove(): never {
    throw new Error('not used');
  }
}

class FakeMaterializations extends SourceMaterializationPort {
  constructor(private readonly records: MaterializationRecord[]) {
    super();
  }

  find(): null {
    return null;
  }

  listForSource(): MaterializationRecord[] {
    return this.records;
  }

  upsert(): never {
    throw new Error('not used');
  }

  removeForSource(): never {
    throw new Error('not used');
  }

  findProjection(): null {
    return null;
  }

  listProjectionsForSource(): [] {
    return [];
  }

  upsertProjection(): never {
    throw new Error('not used');
  }
}

interface PlacementOverrides {
  environment?: RunEnvironment | null;
  materializations?: MaterializationRecord[];
}

function environmentOf(anchor: RunEnvironmentAnchor | null): RunEnvironment {
  return { anchor, cwd: anchor === null ? 'thread' : 'anchor', provenance: 'run' };
}

function placement(overrides?: PlacementOverrides) {
  return resolveRunPlacement({
    orgId: ORG,
    runId: 'run-1',
    agentProfileId: PROFILE.id,
    ...(overrides?.environment !== undefined ? { environment: overrides.environment } : {}),
    profiles: new FakeProfiles(),
    hub: fakeHub([presenceNode('node-a'), presenceNode('node-b')]),
    claims: new FakeClaims(),
    worktrees: new FakeWorktrees(),
    ...(overrides?.materializations !== undefined
      ? { materializations: new FakeMaterializations(overrides.materializations) }
      : {}),
  });
}

describe('resolveRunPlacement', () => {
  test('worktree anchor pins placement to the worktree host', () => {
    const decision = placement({
      environment: environmentOf({ kind: 'source', sourceId: SOURCE, worktreeId: WORKTREE.id }),
    });
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-b');
    }
  });

  test('folder anchor pins placement to the anchor host', () => {
    const decision = placement({
      environment: environmentOf({ kind: 'folder', hostId: 'node-b', path: '/var/lib/shared' }),
    });
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-b');
    }
  });

  test('pin outside the profile is unavailable', () => {
    const decision = placement({
      environment: environmentOf({ kind: 'folder', hostId: 'node-c', path: '/tmp/x' }),
    });
    expect(decision.kind).toBe('unavailable');
  });

  test('source anchor requires the anchor source', () => {
    const decision = placement({
      environment: environmentOf({ kind: 'source', sourceId: SOURCE }),
    });
    expect(decision.request.requiredSources).toEqual([{ sourceId: SOURCE, access: 'write' }]);
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-a');
    }
  });

  test('sourcesReady follows source materializations per node', () => {
    const anchor = { kind: 'source' as const, sourceId: SOURCE };
    const decision = placement({
      environment: environmentOf(anchor),
      materializations: [materialization('node-a', 'absent'), materialization('node-b', 'ready')],
    });
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-b');
    }
    const nodeA = decision.candidates.find((candidate) => candidate.nodeId === 'node-a');
    expect(nodeA?.reasons).toContain('source-not-ready');
    const nowhere = placement({
      environment: environmentOf(anchor),
      materializations: [materialization('node-a', 'materializing')],
    });
    expect(nowhere.kind).toBe('unavailable');
  });

  test('thread placement does not gate on sources', () => {
    const decision = placement({ environment: environmentOf(null) });
    expect(decision.request.requiredSources).toEqual([]);
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-a');
    }
  });
});
