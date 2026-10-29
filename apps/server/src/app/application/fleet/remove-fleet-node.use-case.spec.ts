import { describe, expect, test } from 'bun:test';
import type { MachineOrgEntry, NodeStatus } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type {
  CreateExecutionProfileInput,
  ExecutionProfileRecord,
  ProfileUsage,
  UpdateExecutionProfileInput,
} from '../../domain/execution-profile/execution-profile.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import {
  type InsertNodeInput,
  type NodeRecord,
  NodeRepository,
} from '../../domain/fleet/node-repository.port.ts';
import {
  OrgAudit,
  type OrgAuditPage,
  type OrgAuditRow,
} from '../../domain/fleet/org-audit.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import type { PendingPlacement } from '../../domain/fleet/pending-placement.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';
import { RemoveFleetNodeUseCase } from './remove-fleet-node.use-case.ts';

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
  removed: string[] = [];
  cleared: string[] = [];
  constructor(private node: NodeRecord | null) {
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
  setStatus(): void {}
  updateRoleAndToken(
    _orgId: string,
    nodeId: string,
    patch: { role: 'relay' | 'worker'; tokenHash: string | null },
  ): void {
    if (patch.tokenHash === null) {
      this.cleared.push(nodeId);
    }
    if (this.node && this.node.id === nodeId) {
      this.node = { ...this.node, tokenHash: patch.tokenHash, role: patch.role };
    }
  }
  remove(_orgId: string, nodeId: string): void {
    this.removed.push(nodeId);
    this.node = null;
  }
  readOrgName(): string | null {
    return null;
  }
  exportDbBytes(): Uint8Array {
    return new Uint8Array();
  }
  importDbBytes(): void {}
}

function profileRecord(profileId: string, nodeIds: string[]): ExecutionProfileRecord {
  return {
    id: profileId,
    orgId: 'org-1',
    name: profileId,
    system: false,
    nodeIds,
    isolation: 'host',
    dockerImage: null,
  };
}

class FakeProfiles extends ExecutionProfilePort {
  stripped: string[] = [];
  constructor(private readonly membership: Map<string, string[]>) {
    super();
  }
  list(): ExecutionProfileRecord[] {
    return [...this.membership.entries()].map(([id, nodeIds]) => profileRecord(id, nodeIds));
  }
  findById(_orgId: string, profileId: string): ExecutionProfileRecord | undefined {
    const nodeIds = this.membership.get(profileId);
    if (!nodeIds) {
      return undefined;
    }
    return profileRecord(profileId, nodeIds);
  }
  findByName(): ExecutionProfileRecord | undefined {
    return undefined;
  }
  insert(_orgId: string, _input: CreateExecutionProfileInput): ExecutionProfileRecord {
    throw new Error('unused');
  }
  update(
    _orgId: string,
    _profileId: string,
    _input: UpdateExecutionProfileInput,
  ): ExecutionProfileRecord {
    throw new Error('unused');
  }
  setNodes(_orgId: string, profileId: string, nodeIds: string[]): ExecutionProfileRecord {
    this.membership.set(profileId, nodeIds);
    return profileRecord(profileId, nodeIds);
  }
  removeNodeFromAll(_orgId: string, nodeId: string): void {
    this.stripped.push(nodeId);
    for (const [profileId, nodeIds] of this.membership) {
      this.membership.set(
        profileId,
        nodeIds.filter((id) => id !== nodeId),
      );
    }
  }
  getDefault(): string | undefined {
    return undefined;
  }
  setDefault(): void {}
  delete(): void {}
  ensureLocalDefault(): ExecutionProfileRecord {
    throw new Error('unused');
  }
  countUsage(): ProfileUsage {
    return { orgDefault: false, agents: 0, boardRules: 0 };
  }
}

class FakePending extends PendingPlacementPort {
  upsert(row: PendingPlacement): PendingPlacement {
    return row;
  }
  findByRun(): PendingPlacement | null {
    return null;
  }
  listByOrg(): PendingPlacement[] {
    return [];
  }
  listByProfile(): PendingPlacement[] {
    return [];
  }
  remove(): void {}
  updateReason(): void {}
}

class FakeHub extends FleetHubPort {
  detached: string[] = [];
  commands: Array<{ nodeId: string; command: WorkerCommand }> = [];
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

class FakeKeys extends TicketKeyStore {
  rotated: string[] = [];
  get(): string | null {
    return null;
  }
  ensure(orgId: string): string {
    return `key:${orgId}`;
  }
  rotate(orgId: string): string {
    this.rotated.push(orgId);
    return `rotated:${orgId}`;
  }
}

class FakeAudit extends OrgAudit {
  rows: Array<{ orgId: string; row: OrgAuditRow }> = [];
  append(orgId: string, row: OrgAuditRow): void {
    this.rows.push({ orgId, row });
  }
  list(): OrgAuditPage {
    return { items: [], total: 0 };
  }
}

class FakeRevisions extends OrgConfigRevisionPort {
  private revision = 1;
  private contentHash = 'hash';
  get(): { revision: number; contentHash: string } {
    return { revision: this.revision, contentHash: this.contentHash };
  }
  sync(_orgId: string, contentHash: string): { revision: number; bumped: boolean } {
    if (contentHash === this.contentHash) {
      return { revision: this.revision, bumped: false };
    }
    this.revision += 1;
    this.contentHash = contentHash;
    return { revision: this.revision, bumped: true };
  }
}

function fakeBuildSnapshot(): BuildOrgExecutionSnapshotUseCase {
  const fake = Object.create(
    BuildOrgExecutionSnapshotUseCase.prototype,
  ) as BuildOrgExecutionSnapshotUseCase;
  fake.execute = () => ({
    schemaVersion: 1,
    revision: 1,
    agents: [],
    sources: [],
    providers: [],
    models: [],
    fileAccessRules: [],
    runtime: { skillsSourceAutoLoad: true, timezone: 'UTC', browser: { defaultEngine: 'auto' } },
  });
  return fake;
}

function fakeExecutor(): LocalExecutorPort {
  const fake = Object.create(LocalExecutorPort.prototype) as LocalExecutorPort;
  fake.lifecycle = () => Promise.reject(new Error('unused'));
  return fake;
}

const relayOrg: MachineOrgEntry = {
  orgId: 'org-1',
  name: 'Org',
  description: '',
  role: 'relay',
};

describe('RemoveFleetNodeUseCase', () => {
  test('removes node and strips profile membership', async () => {
    const node: NodeRecord = {
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
    };
    const nodes = new FakeNodes(node);
    const profiles = new FakeProfiles(new Map([['profile-a', ['worker-1', 'worker-2']]]));
    const hub = new FakeHub();
    const keys = new FakeKeys();
    const audit = new FakeAudit();
    const useCase = new RemoveFleetNodeUseCase(
      new FakeStore([relayOrg]),
      nodes,
      profiles,
      new FakePending(),
      hub,
      new FakeEvents(),
      fakeExecutor(),
      new FakeRevisions(),
      keys,
      audit,
      fakeBuildSnapshot(),
    );
    await useCase.execute({
      principal: {
        kind: 'user',
        userId: 'user-1',
        orgId: 'org-1',
        capabilities: ['fleet.manage'],
      },
      orgId: 'org-1',
      nodeId: 'worker-1',
    });
    expect(profiles.stripped).toEqual(['worker-1']);
    expect(profiles.findById('org-1', 'profile-a')?.nodeIds).toEqual(['worker-2']);
    expect(nodes.cleared).toEqual(['worker-1']);
    expect(nodes.removed).toEqual(['worker-1']);
    expect(hub.detached).toEqual(['worker-1']);
    expect(keys.rotated).toEqual(['org-1']);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      orgId: 'org-1',
      row: { actorKind: 'user', actorId: 'user-1', action: 'node_removed', resource: 'worker-1' },
    });
  });
});
