import { describe, expect, test } from 'bun:test';
import type { NodeStatus } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type { ExecutionProfileRecord } from '../../domain/execution-profile/execution-profile.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import { resolveRunPlacement } from './resolve-run-placement.ts';

const ORG = 'org-1';

const PROFILE: ExecutionProfileRecord = {
  id: 'prof-1',
  orgId: ORG,
  name: 'Standard',
  system: false,
  nodeIds: ['node-a', 'node-b'],
  isolation: 'host',
  dockerImage: null,
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

class FakeHub extends FleetHubPort {
  constructor(private readonly nodes: FleetPresenceNode[]) {
    super();
  }

  listPresence(): FleetPresenceNode[] {
    return this.nodes;
  }

  notePing(): NodeStatus | null {
    return null;
  }

  sweepOffline(): void {}

  start(): void {}

  stop(): void {}

  attachPeer(): void {}

  detachPeer(): void {}

  hasPeer(): boolean {
    return false;
  }

  peerNodeIds(): string[] {
    return [];
  }

  broadcastToOrg(): number {
    return 0;
  }

  sendToPeer(): boolean {
    return false;
  }

  routeCommand(): void {}

  requestHttpProxy(): Promise<{ status: number; body: string; contentType: string | null }> {
    return Promise.resolve({ status: 0, body: '', contentType: null });
  }

  resolveProxyResult(): void {}
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

function placement(overrides?: { worktreeHostId?: string }) {
  return resolveRunPlacement({
    orgId: ORG,
    runId: 'run-1',
    agentProfileId: PROFILE.id,
    ...(overrides?.worktreeHostId !== undefined
      ? { worktreeHostId: overrides.worktreeHostId }
      : {}),
    profiles: new FakeProfiles(),
    hub: new FakeHub([presenceNode('node-a'), presenceNode('node-b')]),
    claims: new FakeClaims(),
  });
}

describe('resolveRunPlacement without sources', () => {
  test('shared sources do not gate placement', () => {
    const decision = placement();
    expect(decision.kind).toBe('selected');
    expect(decision.request.requiredSources).toEqual([]);
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-a');
    }
  });

  test('worktree host pins the node even when not in profile', () => {
    const decision = placement({ worktreeHostId: 'node-b' });
    expect(decision.kind).toBe('selected');
    if (decision.kind === 'selected') {
      expect(decision.nodeId).toBe('node-b');
    }
  });

  test('worktree host on unknown node is unavailable', () => {
    const decision = placement({ worktreeHostId: 'node-c' });
    expect(decision.kind).toBe('unavailable');
  });
});
