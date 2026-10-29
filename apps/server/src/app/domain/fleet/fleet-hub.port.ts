import type { NodeStatus } from '@harnesys/contracts';
import type { WorkerCommand } from './worker-command.ts';

export interface PresencePingInput {
  orgId: string;
  nodeId: string;
  diskFreeBytes?: number | null;
  diskTotalBytes?: number | null;
  dockerAvailable?: boolean | null;
}

export interface ProxyHttpRequest {
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
}

export interface ProxyHttpResult {
  status: number;
  body: string;
  contentType: string | null;
  headers?: Record<string, string> | null;
}

export interface FleetPresenceNode {
  id: string;
  name: string;
  role: 'relay' | 'worker';
  status: NodeStatus;
  lastSeenAt: string | null;
  enrolledAt: string;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  dockerAvailable: boolean | null;
}

export abstract class FleetHubPort {
  abstract listPresence(orgId: string): FleetPresenceNode[];
  abstract notePing(input: PresencePingInput): NodeStatus | null;
  abstract sweepOffline(nowIso?: string): void;
  abstract start(): void;
  abstract stop(): void;
  abstract attachPeer(orgId: string, nodeId: string, send: (data: string) => void): void;
  abstract detachPeer(nodeId: string): void;
  abstract hasPeer(nodeId: string): boolean;
  abstract peerNodeIds(orgId: string): string[];
  abstract broadcastToOrg(orgId: string, payload: string): number;
  abstract sendToPeer(nodeId: string, payload: string): boolean;
  abstract routeCommand(nodeId: string, command: WorkerCommand): void;
  abstract requestHttpProxy(
    nodeId: string,
    input: ProxyHttpRequest,
    timeoutMs: number,
  ): Promise<ProxyHttpResult>;
  abstract resolveProxyResult(requestId: string, result: ProxyHttpResult): void;
}
