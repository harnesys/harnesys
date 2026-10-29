import { describe, expect, test } from 'bun:test';
import type { MachineOrgEntry, NodeStatus, SnapshotAckStatus } from '@harnesys/contracts';
import { EventClaimPort, type EventClaimRecord } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { ListFleetNodesUseCase } from './list-fleet-nodes.use-case.ts';

class FakeOrgMachineStore extends OrgMachineStore {
  constructor(private readonly entries: MachineOrgEntry[]) {
    super();
  }

  list(): MachineOrgEntry[] {
    return this.entries;
  }

  upsert(): void {}

  remove(): void {}

  getActive(): string | null {
    return this.entries[0]?.orgId ?? null;
  }

  setActive(): void {}

  get(orgId: string): MachineOrgEntry | undefined {
    return this.entries.find((entry) => entry.orgId === orgId);
  }
}

class FakeFleetHubPort extends FleetHubPort {
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

class FakeEventClaimPort extends EventClaimPort {
  constructor(private readonly counts: Record<string, number>) {
    super();
  }

  grant(): EventClaimRecord | null {
    return null;
  }

  findByRun(): EventClaimRecord | null {
    return null;
  }

  findActiveByNode(): EventClaimRecord[] {
    return [];
  }

  countActiveByNode(_orgId: string, nodeId: string): number {
    return this.counts[nodeId] ?? 0;
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

const baseNode = (overrides?: Partial<FleetPresenceNode>): FleetPresenceNode => ({
  id: 'node-1',
  name: 'relay',
  role: 'relay',
  status: 'online',
  lastSeenAt: new Date().toISOString(),
  enrolledAt: new Date().toISOString(),
  diskFreeBytes: 100,
  diskTotalBytes: 200,
  dockerAvailable: null,
  ...overrides,
});

const relayEntry: MachineOrgEntry = {
  orgId: 'org-1',
  name: 'Org',
  description: '',
  role: 'relay',
  relayUrl: 'http://localhost:47474',
};

class FakeNodeSnapshotAckPort extends NodeSnapshotAckPort {
  constructor(
    private readonly acks: Record<string, { revision: number; status: SnapshotAckStatus }> = {},
  ) {
    super();
  }

  record(): void {}

  find(_orgId: string, nodeId: string): { revision: number; status: SnapshotAckStatus } | null {
    return this.acks[nodeId] ?? null;
  }

  isReadyForRevision(orgId: string, nodeId: string, revision: number): boolean {
    const ack = this.find(orgId, nodeId);
    return ack !== null && ack.status === 'accepted' && ack.revision === revision;
  }
}

class FakeOrgConfigRevisionPort extends OrgConfigRevisionPort {
  get(): { revision: number; contentHash: string } {
    return { revision: 2, contentHash: 'hash' };
  }

  sync(): { revision: number; bumped: boolean } {
    return { revision: 2, bumped: false };
  }
}

function createUseCase(
  nodes: FleetPresenceNode[],
  entries: MachineOrgEntry[],
  claims: Record<string, number>,
  acks?: Record<string, { revision: number; status: SnapshotAckStatus }>,
) {
  return new ListFleetNodesUseCase(
    new FakeFleetHubPort(nodes),
    new FakeOrgMachineStore(entries),
    new FakeEventClaimPort(claims),
    new FakeNodeSnapshotAckPort(acks),
    new FakeOrgConfigRevisionPort(),
  );
}

describe('ListFleetNodesUseCase', () => {
  test('returns nodes with active claims and accepts work', () => {
    const useCase = createUseCase(
      [
        baseNode({ id: 'node-1', role: 'relay', status: 'online' }),
        baseNode({ id: 'node-2', role: 'worker', status: 'online' }),
        baseNode({ id: 'node-3', role: 'worker', status: 'draining' }),
        baseNode({ id: 'node-4', role: 'worker', status: 'offline' }),
      ],
      [relayEntry],
      { 'node-2': 3, 'node-3': 1 },
      { 'node-2': { revision: 2, status: 'accepted' } },
    );

    const { nodes } = useCase.execute('org-1');

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({
      id: 'node-1',
      activeClaims: 0,
      acceptsWork: true,
      configSync: 'ready',
    });
    expect(nodes[1]).toMatchObject({
      id: 'node-2',
      activeClaims: 3,
      acceptsWork: true,
      configSync: 'ready',
    });
    expect(nodes[2]).toMatchObject({ id: 'node-3', activeClaims: 1, acceptsWork: false });
    expect(nodes[3]).toMatchObject({ id: 'node-4', activeClaims: 0, acceptsWork: false });
  });

  test('rejects non-relay orgs', () => {
    const useCase = createUseCase([], [{ ...relayEntry, role: 'worker' }], {});

    expect(() => useCase.execute('org-1')).toThrow(
      'Organization is not a relay on this machine: org-1',
    );
  });

  test('rejects unknown orgs', () => {
    const useCase = createUseCase([], [], {});

    expect(() => useCase.execute('org-missing')).toThrow('Organization not found: org-missing');
  });
});
