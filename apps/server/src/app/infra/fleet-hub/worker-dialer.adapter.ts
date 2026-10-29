import {
  Configuration,
  Injectable,
  Logger,
  type ModuleDestroyHook,
  type ModuleInitHook,
} from '@harnesys/brix';
import { type OrgExecutionSnapshot, SnapshotFrameSchema } from '@harnesys/contracts';
import type { AppConfig } from '../../../config.schema.ts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { PendingRunEventPort } from '../../domain/fleet/pending-run-event.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { WorkerContentHandler } from '../content/worker-content.handler.ts';
import { probeDocker } from './docker-probe.util.ts';
import { WorkerCloudSyncWatch } from './worker-cloud-sync-watch.ts';
import { handleWorkerCommand } from './worker-dialer.commands.ts';
import { replayMaterializationStates } from './worker-dialer.materialize.ts';
import { flushDeferredPlaces } from './worker-dialer.place-run.ts';
import {
  type DialerSession,
  HEARTBEAT_INTERVAL_MS,
  openDialerSocket,
  pingRelayHttp,
  scheduleDialerReconnect,
  syncDialerSessions,
  teardownDialerSession,
  WS_BACKOFF_MIN_MS,
  WS_PING_INTERVAL_MS,
} from './worker-dialer.session.ts';
import {
  applyConnectedSnapshot,
  handleRunEventAckFrame,
  parseConnectedSnapshot,
  replayPendingRunEvents,
} from './worker-dialer.sync.ts';
import type { WorkerSocket } from './worker-dialer.util.ts';
import { WorkerWorkExecutor } from './worker-work-executor.ts';

@Injectable()
export class WorkerDialerAdapter implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sessions = new Map<string, DialerSession>();

  constructor(
    private readonly identities: NodeIdentityStore,
    private readonly store: OrgMachineStore,
    private readonly contentHandler: WorkerContentHandler,
    private readonly workExecutor: WorkerWorkExecutor,
    private readonly replica: OrgExecutionReplicaPort,
    private readonly pendingEvents: PendingRunEventPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly secrets: SecretStorePort,
    private readonly containers: WorkspaceContainerPort,
    private readonly cloudSyncWatch: WorkerCloudSyncWatch,
    @Configuration() readonly _appConfig: AppConfig,
    logger: Logger,
  ) {
    this.log = logger.child('worker-dialer');
  }

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.heartbeatTimer) {
      return;
    }
    void this.tickHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.tickHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    this.syncSessions();
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const session of this.sessions.values()) {
      this.cloudSyncWatch.stop(session.identity.orgId);
      teardownDialerSession(session, 'stopped', (s) => this.clearSessionTimers(s));
    }
    this.sessions.clear();
  }

  private syncSessions(): void {
    syncDialerSessions({
      sessions: this.sessions,
      store: this.store,
      identities: this.identities,
      dial: (session) => this.dial(session),
      teardown: (session, reason) =>
        teardownDialerSession(session, reason, (s) => this.clearSessionTimers(s)),
    });
  }

  private async tickHeartbeat(): Promise<void> {
    this.syncSessions();
    for (const entry of this.store.list().filter((row) => row.role === 'worker')) {
      const identity = this.identities.read(entry.orgId);
      if (!identity) {
        continue;
      }
      try {
        await pingRelayHttp(identity.relayUrl, identity.orgId, identity.token);
      } catch (err) {
        this.log.warn(
          {
            orgId: identity.orgId,
            relayUrl: identity.relayUrl,
            err: err instanceof Error ? err.message : String(err),
          },
          'worker heartbeat failed',
        );
      }
    }
  }

  private dial(session: DialerSession): void {
    if (session.stopped) {
      return;
    }
    const socket = openDialerSocket(session);
    if (!socket) {
      scheduleDialerReconnect(session, (s) => this.dial(s));
      return;
    }
    session.snapshotReady = false;
    socket.onopen = () => {
      void this.sendConnect(session, socket);
    };
    socket.onmessage = (event) => {
      this.handleMessage(session, event.data);
    };
    socket.onclose = () => {
      if (session.socket === socket) {
        session.socket = null;
      }
      session.snapshotReady = false;
      this.clearPing(session);
      scheduleDialerReconnect(session, (s) => this.dial(s));
    };
    socket.onerror = () => {
      try {
        socket.close(1011, 'socket error');
      } catch {
        // ignore
      }
    };
    session.socket = socket;
  }

  private async sendConnect(session: DialerSession, socket: WorkerSocket): Promise<void> {
    const dockerAvailable = await probeDocker();
    if (session.socket !== socket || session.stopped) {
      return;
    }
    socket.send(
      JSON.stringify({
        kind: 'CONNECT',
        orgId: session.identity.orgId,
        nodeId: session.identity.nodeId,
        token: session.identity.token,
        dockerAvailable,
      }),
    );
  }

  private handleMessage(session: DialerSession, data: unknown): void {
    if (typeof data !== 'string') {
      return;
    }
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (frame.kind === 'CONNECTED') {
      this.onConnected(session, frame);
      return;
    }
    if (frame.kind === 'SNAPSHOT') {
      this.onSnapshot(session, frame);
      return;
    }
    if (frame.kind === 'RUN_EVENT_ACK') {
      handleRunEventAckFrame(this.pendingEvents, session.identity.orgId, frame);
      return;
    }
    if (frame.kind === 'COMMAND') {
      this.handleCommand(session, frame);
    }
  }

  private onConnected(session: DialerSession, frame: Record<string, unknown>): void {
    session.backoffMs = WS_BACKOFF_MIN_MS;
    this.startPing(session);
    const snapshot = parseConnectedSnapshot(frame);
    if (!snapshot) {
      session.snapshotReady = false;
      this.log.warn({ orgId: session.identity.orgId }, 'CONNECTED without valid snapshot');
      return;
    }
    this.applySnapshot(session, snapshot);
    if (session.snapshotReady) {
      replayPendingRunEvents(this.pendingEvents, session.identity.orgId, (payload) => {
        try {
          session.socket?.send(payload);
        } catch {
          // ignore
        }
      });
      replayMaterializationStates(this.matDeps(), session);
      flushDeferredPlaces({
        session,
        log: this.log,
        workExecutor: this.workExecutor,
        pendingEvents: this.pendingEvents,
        layout: this.layout,
      });
      this.cloudSyncWatch.sync(session, true);
    }
  }

  private onSnapshot(session: DialerSession, frame: Record<string, unknown>): void {
    const parsed = SnapshotFrameSchema.safeParse(frame);
    if (!parsed.success) {
      this.log.warn({ orgId: session.identity.orgId }, 'SNAPSHOT schema invalid');
      return;
    }
    this.applySnapshot(session, parsed.data.snapshot);
    this.cloudSyncWatch.sync(session, false);
    if (session.snapshotReady) {
      flushDeferredPlaces({
        session,
        log: this.log,
        workExecutor: this.workExecutor,
        pendingEvents: this.pendingEvents,
        layout: this.layout,
      });
    }
  }

  private applySnapshot(session: DialerSession, snapshot: OrgExecutionSnapshot): void {
    const ack = applyConnectedSnapshot(this.replica, session.identity.orgId, snapshot);
    session.snapshotReady = ack.status === 'accepted';
    try {
      session.socket?.send(JSON.stringify(ack));
    } catch {
      // ignore
    }
  }

  private handleCommand(session: DialerSession, frame: Record<string, unknown>): void {
    handleWorkerCommand({
      session,
      frame,
      log: this.log,
      contentHandler: this.contentHandler,
      workExecutor: this.workExecutor,
      pendingEvents: this.pendingEvents,
      layout: this.layout,
      store: this.store,
      identities: this.identities,
      onOrgDropped: (orgId) => this.dropSession(orgId),
      matDeps: this.matDeps(),
      worktreeDeps: this.worktreeDeps(),
      onCloudMaterialized: () => this.cloudSyncWatch.sync(session, true),
    });
  }

  private dropSession(orgId: string): void {
    const session = this.sessions.get(orgId);
    if (!session) {
      return;
    }
    this.cloudSyncWatch.stop(orgId);
    teardownDialerSession(session, 'org removed', (s) => this.clearSessionTimers(s));
    this.sessions.delete(orgId);
  }

  private startPing(session: DialerSession): void {
    this.clearPing(session);
    session.pingTimer = setInterval(() => {
      try {
        session.socket?.send(JSON.stringify({ kind: 'PING' }));
      } catch {
        // ignore
      }
    }, WS_PING_INTERVAL_MS);
  }

  private clearPing(session: DialerSession): void {
    if (session.pingTimer) {
      clearInterval(session.pingTimer);
      session.pingTimer = null;
    }
  }

  private matDeps() {
    return {
      replica: this.replica,
      layout: this.layout,
      machineConfig: this.machineConfig,
      driver: this.driver,
      materializations: this.materializations,
      secrets: this.secrets,
    } as const;
  }

  private worktreeDeps() {
    return {
      layout: this.layout,
      machineConfig: this.machineConfig,
      driver: this.driver,
      containers: this.containers,
      log: this.log,
    } as const;
  }

  private clearSessionTimers(session: DialerSession): void {
    this.clearPing(session);
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
  }
}
