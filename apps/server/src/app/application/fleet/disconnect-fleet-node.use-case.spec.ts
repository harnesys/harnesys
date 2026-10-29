import { describe, expect, test } from 'bun:test';
import type { MachineOrgEntry, NodeStatus } from '@harnesys/contracts';
import { CannotRemoveRelayException } from '../../domain/fleet/fleet.error.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import {
  type InsertNodeInput,
  type NodeRecord,
  NodeRepository,
} from '../../domain/fleet/node-repository.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { DisconnectFleetNodeUseCase } from './disconnect-fleet-node.use-case.ts';

class FakeStore extends OrgMachineStore {
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

class FakeNodes extends NodeRepository {
  statuses = new Map<string, NodeStatus>();
  constructor(private readonly node: NodeRecord | null) {
    super();
  }
  insert(_orgId: string, _node: InsertNodeInput): void {}
  findById(): NodeRecord | null {
    return this.node;
  }
  findByName(): NodeRecord | null {
    return this.node;
  }
  findByTokenHash(): NodeRecord | null {
    return this.node;
  }
  list(): NodeRecord[] {
    return this.node ? [this.node] : [];
  }
  updatePresence(): void {}
  setStatus(_orgId: string, nodeId: string, status: NodeStatus): void {
    this.statuses.set(nodeId, status);
  }
  updateRoleAndToken(): void {}
  remove(): void {}
  readOrgName(): string | null {
    return null;
  }
  exportDbBytes(): Uint8Array {
    return new Uint8Array();
  }
  importDbBytes(): void {}
}

class FakeHub extends FleetHubPort {
  detached: string[] = [];
  commands: Array<{ nodeId: string; command: WorkerCommand }> = [];
  constructor(private readonly online: Set<string> = new Set()) {
    super();
  }
  listPresence(): FleetPresenceNode[] {
    return [];
  }
  notePing(): NodeStatus | null {
    return null;
  }
  sweepOffline(): void {}
  start(): void {}
  stop(): void {}
  attachPeer(): void {}
  detachPeer(nodeId: string): void {
    this.detached.push(nodeId);
  }
  hasPeer(nodeId: string): boolean {
    return this.online.has(nodeId);
  }
  peerNodeIds(): string[] {
    return [...this.online];
  }
  broadcastToOrg(): number {
    return 0;
  }
  sendToPeer(): boolean {
    return false;
  }
  routeCommand(nodeId: string, command: WorkerCommand): void {
    this.commands.push({ nodeId, command });
  }
  requestHttpProxy(): Promise<{ status: number; body: string; contentType: string | null }> {
    return Promise.resolve({ status: 0, body: '', contentType: null });
  }
  resolveProxyResult(): void {}
}

class FakeEvents extends FleetEventsPort {
  emit(): void {}
  subscribe(): () => void {
    return () => undefined;
  }
}

const relayOrg: MachineOrgEntry = {
  orgId: 'org-1',
  name: 'Org',
  description: '',
  role: 'relay',
};

function workerNode(overrides: Partial<NodeRecord> = {}): NodeRecord {
  return {
    id: 'worker-1',
    name: 'Worker',
    role: 'worker',
    tokenHash: 'hash',
    lastSeenAt: null,
    status: 'online',
    enrolledAt: new Date().toISOString(),
    diskFreeBytes: null,
    diskTotalBytes: null,
    dockerAvailable: null,
    ...overrides,
  };
}

describe('DisconnectFleetNodeUseCase', () => {
  test('sets draining and detaches peer', () => {
    const nodes = new FakeNodes(workerNode());
    const hub = new FakeHub(new Set(['worker-1']));
    const useCase = new DisconnectFleetNodeUseCase(
      new FakeStore([relayOrg]),
      nodes,
      hub,
      new FakeEvents(),
    );
    useCase.execute({ orgId: 'org-1', nodeId: 'worker-1' });
    expect(nodes.statuses.get('worker-1')).toBe('draining');
    expect(hub.detached).toEqual(['worker-1']);
    expect(hub.commands).toEqual([{ nodeId: 'worker-1', command: { type: 'NODE_DRAIN' } }]);
  });

  test('cannot disconnect relay node', () => {
    const useCase = new DisconnectFleetNodeUseCase(
      new FakeStore([relayOrg]),
      new FakeNodes(workerNode({ id: 'relay-1', role: 'relay' })),
      new FakeHub(),
      new FakeEvents(),
    );
    expect(() => useCase.execute({ orgId: 'org-1', nodeId: 'relay-1' })).toThrow(
      CannotRemoveRelayException,
    );
  });
});
