import type { Container } from '@harnesys/brix';
import { SnapshotAckFrameSchema } from '@harnesys/contracts';
import type { WSContext } from 'hono/ws';
import { BuildOrgExecutionSnapshotUseCase } from '../../application/fleet/build-org-execution-snapshot.use-case.ts';
import { hashNodeToken } from '../../application/fleet/hash-node-token.ts';
import { IngestRunEventUseCase } from '../../application/fleet/ingest-run-event.use-case.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort, type ProxyHttpResult } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { bunWebsocket, upgradeWebSocket } from '../ws/bun-websocket.ts';
import { handleSourceMaterialization, handleSourceWorktree } from './fleet-worker.source-frames.ts';

export { bunWebsocket as fleetWorkerWebsocket };

interface PeerLink {
  get(): { orgId: string; nodeId: string } | null;
  set(value: { orgId: string; nodeId: string } | null): void;
}

interface HonoLike {
  get(path: string, handler: unknown): unknown;
}

export function registerFleetWorkerWs(app: HonoLike, container: Container): void {
  const hub = container.resolve<FleetHubPort>(FleetHubPort);
  const fleetEvents = container.resolve<FleetEventsPort>(FleetEventsPort);
  const nodes = container.resolve<NodeRepository>(NodeRepository);
  const ingest = container.resolve<IngestRunEventUseCase>(IngestRunEventUseCase);
  const materializations = container.resolve<SourceMaterializationPort>(SourceMaterializationPort);
  const materializationEvents =
    container.resolve<MaterializationEventsPort>(MaterializationEventsPort);
  const worktrees = container.resolve<RepositoryWorktreePort>(RepositoryWorktreePort);
  const buildSnapshot = container.resolve<BuildOrgExecutionSnapshotUseCase>(
    BuildOrgExecutionSnapshotUseCase,
  );
  const snapshotAcks = container.resolve<NodeSnapshotAckPort>(NodeSnapshotAckPort);

  app.get(
    '/api/fleet/worker',
    upgradeWebSocket(() => {
      let linked: { orgId: string; nodeId: string } | null = null;
      const link: PeerLink = {
        get: () => linked,
        set: (value) => {
          linked = value;
        },
      };
      return {
        onMessage: (evt, ws) => {
          handleFrame({
            data: evt.data,
            ws,
            link,
            hub,
            fleetEvents,
            nodes,
            ingest,
            materializations,
            materializationEvents,
            worktrees,
            buildSnapshot,
            snapshotAcks,
          });
        },
        onClose: () => {
          const current = link.get();
          link.set(null);
          if (current !== null) {
            hub.detachPeer(current.nodeId);
          }
        },
      };
    }),
  );
}

function handleFrame(input: {
  data: unknown;
  ws: WSContext;
  link: PeerLink;
  hub: FleetHubPort;
  fleetEvents: FleetEventsPort;
  nodes: NodeRepository;
  ingest: IngestRunEventUseCase;
  materializations: SourceMaterializationPort;
  materializationEvents: MaterializationEventsPort;
  worktrees: RepositoryWorktreePort;
  buildSnapshot: BuildOrgExecutionSnapshotUseCase;
  snapshotAcks: NodeSnapshotAckPort;
}): void {
  const {
    data,
    ws,
    link,
    hub,
    fleetEvents,
    nodes,
    ingest,
    materializations,
    materializationEvents,
    worktrees,
    buildSnapshot,
    snapshotAcks,
  } = input;
  if (typeof data !== 'string') {
    return;
  }
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  if (frame.kind === 'CONNECT') {
    handleConnect({ frame, ws, link, hub, fleetEvents, nodes, buildSnapshot });
    return;
  }
  if (frame.kind === 'SNAPSHOT_ACK') {
    handleSnapshotAck(frame, ws, link, snapshotAcks, fleetEvents);
    return;
  }
  if (frame.kind === 'PING') {
    handlePing(ws, link, hub);
    return;
  }
  if (frame.kind === 'HTTP_PROXY_RESULT') {
    handleProxyResult(frame, ws, link, hub);
    return;
  }
  if (frame.kind === 'RUN_EVENT') {
    void handleRunEvent(frame, ws, link, ingest);
    return;
  }
  if (frame.kind === 'SOURCE_MATERIALIZATION') {
    handleSourceMaterialization(frame, ws, link, materializations, materializationEvents);
    return;
  }
  if (frame.kind === 'SOURCE_WORKTREE') {
    handleSourceWorktree(frame, ws, link, worktrees);
  }
}

function handleConnect(input: {
  frame: Record<string, unknown>;
  ws: WSContext;
  link: PeerLink;
  hub: FleetHubPort;
  fleetEvents: FleetEventsPort;
  nodes: NodeRepository;
  buildSnapshot: BuildOrgExecutionSnapshotUseCase;
}): void {
  const { frame, ws, link, hub, fleetEvents, nodes, buildSnapshot } = input;
  if (
    typeof frame.orgId !== 'string' ||
    typeof frame.nodeId !== 'string' ||
    typeof frame.token !== 'string'
  ) {
    ws.close(1008, 'connect requires orgId, nodeId and token');
    return;
  }
  const row = nodes.findByTokenHash(frame.orgId, hashNodeToken(frame.token));
  if (!row || row.id !== frame.nodeId) {
    ws.close(1008, 'node unauthorized');
    return;
  }
  link.set({ orgId: frame.orgId, nodeId: row.id });
  hub.attachPeer(frame.orgId, row.id, (payload) => {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  });
  hub.notePing({
    orgId: frame.orgId,
    nodeId: row.id,
    dockerAvailable: readDockerAvailable(frame.dockerAvailable),
  });
  const snapshot = buildSnapshot.execute(frame.orgId);
  ws.send(JSON.stringify({ kind: 'CONNECTED', nodeId: row.id, snapshot }));
  fleetEvents.emit(frame.orgId);
}

function handleSnapshotAck(
  frame: Record<string, unknown>,
  ws: WSContext,
  link: PeerLink,
  snapshotAcks: NodeSnapshotAckPort,
  fleetEvents: FleetEventsPort,
): void {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  const parsed = SnapshotAckFrameSchema.safeParse(frame);
  if (!parsed.success) {
    return;
  }
  snapshotAcks.record(current.orgId, current.nodeId, parsed.data.revision, parsed.data.status);
  fleetEvents.emit(current.orgId);
}

function handlePing(ws: WSContext, link: PeerLink, hub: FleetHubPort): void {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  hub.notePing({ orgId: current.orgId, nodeId: current.nodeId });
}

function handleProxyResult(
  frame: Record<string, unknown>,
  ws: WSContext,
  link: PeerLink,
  hub: FleetHubPort,
): void {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  if (typeof frame.requestId !== 'string') {
    return;
  }
  const result = readProxyResult(frame.result);
  if (!result) {
    return;
  }
  hub.resolveProxyResult(frame.requestId, result);
}

async function handleRunEvent(
  frame: Record<string, unknown>,
  ws: WSContext,
  link: PeerLink,
  ingest: IngestRunEventUseCase,
): Promise<void> {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  if (
    typeof frame.runId !== 'string' ||
    typeof frame.leaseEpoch !== 'number' ||
    typeof frame.fromSeq !== 'number' ||
    !Array.isArray(frame.events)
  ) {
    return;
  }
  const events = frame.events.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
  const result = await ingest.execute({
    orgId: current.orgId,
    nodeId: current.nodeId,
    runId: frame.runId,
    leaseEpoch: frame.leaseEpoch,
    fromSeq: frame.fromSeq,
    events,
  });
  try {
    ws.send(
      JSON.stringify({
        kind: 'RUN_EVENT_ACK',
        runId: frame.runId,
        accepted: result.accepted,
        lastSeq: result.lastSeq,
      }),
    );
  } catch {
    // ignore
  }
}

function readDockerAvailable(value: unknown): boolean | null | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readProxyResult(value: unknown): ProxyHttpResult | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.status !== 'number' || typeof record.body !== 'string') {
    return null;
  }
  return {
    status: record.status,
    body: record.body,
    contentType: typeof record.contentType === 'string' ? record.contentType : null,
    headers: readProxyHeaders(record.headers),
  };
}

function readProxyHeaders(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [name, header] of Object.entries(value as Record<string, unknown>)) {
    if (typeof header === 'string' && Object.keys(out).length < 20) {
      out[name] = header;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
