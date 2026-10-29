import { randomUUID } from 'node:crypto';
import { Injectable, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { type NodeStatus, PRESENCE_OFFLINE_AFTER_MS } from '@harnesys/contracts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import {
  FleetHubPort,
  type FleetPresenceNode,
  type PresencePingInput,
  type ProxyHttpRequest,
  type ProxyHttpResult,
} from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { ProxyRequestTracker } from './proxy-requests.ts';

const SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class FleetHubAdapter extends FleetHubPort implements ModuleInitHook, ModuleDestroyHook {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly peers = new Map<string, (data: string) => void>();
  private readonly peerOrgs = new Map<string, string>();
  private readonly proxy = new ProxyRequestTracker();

  constructor(
    private readonly nodes: NodeRepository,
    private readonly store: OrgMachineStore,
    private readonly commands: NodeCommandQueuePort,
    private readonly events: FleetEventsPort,
  ) {
    super();
  }

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.sweepTimer) {
      return;
    }
    this.sweepTimer = setInterval(() => {
      this.sweepOffline();
    }, SWEEP_INTERVAL_MS);
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.peers.clear();
    this.peerOrgs.clear();
    this.proxy.failAll(new Error('proxy_failed'));
  }

  attachPeer(orgId: string, nodeId: string, send: (data: string) => void): void {
    this.peers.set(nodeId, send);
    this.peerOrgs.set(nodeId, orgId);
    void this.commands.drain(orgId, nodeId, (command) => {
      const peer = this.peers.get(nodeId);
      if (!peer) {
        return Promise.resolve(false);
      }
      peer(JSON.stringify({ kind: 'COMMAND', commandId: randomUUID(), command }));
      return Promise.resolve(true);
    });
  }

  detachPeer(nodeId: string): void {
    this.peers.delete(nodeId);
    this.peerOrgs.delete(nodeId);
  }

  hasPeer(nodeId: string): boolean {
    return this.peers.has(nodeId);
  }

  peerNodeIds(orgId: string): string[] {
    const ids: string[] = [];
    for (const [nodeId, peerOrgId] of this.peerOrgs) {
      if (peerOrgId === orgId && this.peers.has(nodeId)) {
        ids.push(nodeId);
      }
    }
    return ids;
  }

  broadcastToOrg(orgId: string, payload: string): number {
    let sent = 0;
    for (const nodeId of this.peerNodeIds(orgId)) {
      if (this.sendToPeer(nodeId, payload)) {
        sent += 1;
      }
    }
    return sent;
  }

  sendToPeer(nodeId: string, payload: string): boolean {
    const send = this.peers.get(nodeId);
    if (!send) {
      return false;
    }
    try {
      send(payload);
      return true;
    } catch {
      return false;
    }
  }

  routeCommand(nodeId: string, command: WorkerCommand): void {
    const send = this.peers.get(nodeId);
    if (!send) {
      const orgId = this.peerOrgs.get(nodeId) ?? this.orgIdForNode(nodeId);
      if (orgId) {
        this.commands.enqueue(orgId, nodeId, command);
      }
      return;
    }
    send(JSON.stringify({ kind: 'COMMAND', commandId: randomUUID(), command }));
  }

  requestHttpProxy(
    nodeId: string,
    input: ProxyHttpRequest,
    timeoutMs: number,
  ): Promise<ProxyHttpResult> {
    return this.proxy.request(() => this.peers.get(nodeId), input, timeoutMs);
  }

  resolveProxyResult(requestId: string, result: ProxyHttpResult): void {
    this.proxy.resolve(requestId, result);
  }

  listPresence(orgId: string): FleetPresenceNode[] {
    const nowMs = Date.now();
    return this.nodes.list(orgId).map((row) => {
      const status = resolveStatus(row.status, row.lastSeenAt, nowMs, row.role);
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        status,
        lastSeenAt: row.lastSeenAt,
        enrolledAt: row.enrolledAt,
        diskFreeBytes: row.diskFreeBytes,
        diskTotalBytes: row.diskTotalBytes,
        dockerAvailable: row.dockerAvailable,
      };
    });
  }

  notePing(input: PresencePingInput): NodeStatus | null {
    const row = this.nodes.findById(input.orgId, input.nodeId);
    if (!row) {
      return null;
    }
    const now = new Date().toISOString();
    const status: NodeStatus = row.status === 'draining' ? 'draining' : 'online';
    const changed = row.status !== status;
    this.nodes.updatePresence(input.orgId, input.nodeId, {
      lastSeenAt: now,
      status,
      diskFreeBytes: input.diskFreeBytes,
      diskTotalBytes: input.diskTotalBytes,
      dockerAvailable: input.dockerAvailable,
    });
    if (changed) {
      this.events.emit(input.orgId);
    }
    return status;
  }

  sweepOffline(nowIso?: string): void {
    const nowMs = Date.parse(nowIso ?? new Date().toISOString());
    for (const entry of this.store.list()) {
      if (entry.role === 'relay') {
        this.sweepOrgWorkers(entry.orgId, nowMs);
      }
    }
  }

  private orgIdForNode(nodeId: string): string | null {
    for (const entry of this.store.list()) {
      if (this.nodes.findById(entry.orgId, nodeId)) {
        return entry.orgId;
      }
    }
    return null;
  }

  private sweepOrgWorkers(orgId: string, nowMs: number): void {
    let changed = false;
    for (const row of this.nodes.list(orgId)) {
      if (shouldMarkOffline(row.role, row.status, row.lastSeenAt, nowMs)) {
        this.nodes.setStatus(orgId, row.id, 'offline');
        changed = true;
      }
    }
    if (changed) {
      this.events.emit(orgId);
    }
  }
}

function isOnline(lastSeenAt: string | null, nowMs: number): boolean {
  if (lastSeenAt === null) {
    return false;
  }
  return nowMs - Date.parse(lastSeenAt) < PRESENCE_OFFLINE_AFTER_MS;
}

function shouldMarkOffline(
  role: 'relay' | 'worker',
  status: NodeStatus,
  lastSeenAt: string | null,
  nowMs: number,
): boolean {
  if (role === 'relay') {
    return false;
  }
  if (status !== 'online' && status !== 'draining') {
    return false;
  }
  return !isOnline(lastSeenAt, nowMs);
}

function resolveStatus(
  status: NodeStatus,
  lastSeenAt: string | null,
  nowMs: number,
  role: 'relay' | 'worker',
): NodeStatus {
  if (role === 'relay') {
    return 'online';
  }
  if (status === 'draining') {
    return isOnline(lastSeenAt, nowMs) ? 'draining' : 'offline';
  }
  return isOnline(lastSeenAt, nowMs) ? 'online' : 'offline';
}
