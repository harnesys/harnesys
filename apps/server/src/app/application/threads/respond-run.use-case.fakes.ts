import type {
  AcceptedRunResponse,
  CancelRunResponse,
  NodeStatus,
  RetryRunResponse,
} from '@harnesys/contracts';
import type {
  McpServerInfo,
  RunEventStore,
  RunLifecycleStore,
  RunRecord,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  EventClaimPort,
  type EventClaimRecord,
  type GrantEventClaimInput,
} from '../../domain/fleet/event-claim.port.ts';
import type {
  FleetPresenceNode,
  PresencePingInput,
  ProxyHttpResult,
} from '../../domain/fleet/fleet-hub.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRecord,
} from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import type {
  CompactThreadResult,
  SendLocalRunInput,
} from '../../domain/thread/local-executor.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import type {
  ThreadActiveRun,
  ThreadInsert,
  ThreadPatch,
  ThreadRecord,
} from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  MemoryApprovalEvents,
  MemoryApprovalStore,
  StubFileRules,
  StubMachineConfig,
  StubSourceLocation,
} from '../approvals/approval-fakes.ts';
import { makeRunRecord, makeThread, RUN_ID, THREAD_ID } from './respond-run.use-case.fixtures.ts';
import { RespondRunUseCase } from './respond-run.use-case.ts';

export {
  APPROVAL_ID,
  ASK_ID,
  makeApproval,
  ORG,
  RUN_ID,
  THREAD_ID,
} from './respond-run.use-case.fixtures.ts';

class StubLifecycle implements RunLifecycleStore {
  async get(id: string): Promise<RunRecord | null> {
    return id === RUN_ID ? makeRunRecord() : null;
  }
  create(): Promise<RunRecord> {
    return Promise.resolve(makeRunRecord());
  }
  activeByThread(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
  childrenByParent(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  claim(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
  transition(): Promise<RunRecord> {
    return Promise.resolve(makeRunRecord());
  }
  renewLease(): Promise<boolean> {
    return Promise.resolve(false);
  }
  listClaimable(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  listDueTimers(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  listStaleRunning(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
}

class StubSession implements SessionHandle {
  send(): Promise<{ runId: string }> {
    return Promise.resolve({ runId: RUN_ID });
  }
  async respond(): Promise<void> {}
  async reject(): Promise<void> {}
  async cancel(): Promise<void> {}
  subscribe(): AsyncIterable<SessionEvent> {
    return (async function* () {})();
  }
  runOf(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
  activeRun(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
}

class StubThreads extends ThreadRepositoryPort {
  findById(_orgId: string, id: string): ThreadRecord | undefined {
    return id === THREAD_ID ? makeThread() : undefined;
  }
  listByOrg(): ThreadRecord[] {
    return [];
  }
  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }
  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }
  insert(_rec: ThreadInsert): ThreadRecord {
    throw new Error('not used');
  }
  patch(_orgId: string, _id: string, _patch: ThreadPatch): ThreadRecord {
    throw new Error('not used');
  }
  markRead(): ThreadRecord {
    throw new Error('not used');
  }
  updateTitle(): ThreadRecord {
    throw new Error('not used');
  }
  touch(): void {}
  delete(): void {}
  deleteByAgent(): void {}
  listByIssue(): ThreadRecord[] {
    return [];
  }
  findByIssueAndAgent(): ThreadRecord | undefined {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
}

class StubExecutor extends LocalExecutorPort {
  async lifecycle(): Promise<RunLifecycleStore> {
    return new StubLifecycle();
  }
  async sessionFor(): Promise<SessionHandle> {
    return new StubSession();
  }
  events(): Promise<RunEventStore> {
    return Promise.reject(new Error('not used'));
  }
  send(_input: SendLocalRunInput): Promise<AcceptedRunResponse> {
    throw new Error('not used');
  }
  compact = (): Promise<CompactThreadResult> => Promise.reject(new Error('not used'));
  drainMessageQueue = (): Promise<never> => Promise.reject(new Error('not used'));
  steerMessageQueue = (): Promise<never> => Promise.reject(new Error('not used'));
  cancel(): Promise<CancelRunResponse> {
    throw new Error('not used');
  }
  retry(): Promise<RetryRunResponse> {
    throw new Error('not used');
  }
  truncateThreadFrom(): Promise<TruncateThreadResult> {
    throw new Error('not used');
  }
  removeThreadEvent(): Promise<SessionEvent> {
    throw new Error('not used');
  }
  stream(): Promise<AsyncIterable<SessionEvent>> {
    throw new Error('not used');
  }
  publishEvents(): Promise<void> {
    throw new Error('not used');
  }
  tickWaitTimers(): Promise<number> {
    throw new Error('not used');
  }
  countWaitingTimers(): Promise<number> {
    throw new Error('not used');
  }
  listMcpServers(): Promise<McpServerInfo[]> {
    throw new Error('not used');
  }
  invalidateRuntime(): Promise<void> {
    return Promise.resolve();
  }
}

class StubClaims extends EventClaimPort {
  grant(_input: GrantEventClaimInput): EventClaimRecord | null {
    return null;
  }
  findByRun(): EventClaimRecord | null {
    return null;
  }
  findActiveByNode(): EventClaimRecord[] {
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
class StubHub extends FleetHubPort {
  listPresence(): FleetPresenceNode[] {
    return [];
  }
  notePing(_input: PresencePingInput): NodeStatus | null {
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
  routeCommand(_nodeId: string, _command: WorkerCommand): void {}
  requestHttpProxy(): Promise<ProxyHttpResult> {
    return Promise.reject(new Error('not used'));
  }
  resolveProxyResult(): void {}
}
class StubAgents extends AgentRegistryPort {
  list(): AgentRecord[] {
    return [];
  }
  findById(): AgentRecord | undefined {
    return undefined;
  }
  findByName(): AgentRecord | undefined {
    return undefined;
  }
  insert(_rec: AgentRecord): AgentRecord {
    throw new Error('not used');
  }
  update(_orgId: string, _id: string, _patch: AgentPatch): AgentRecord {
    throw new Error('not used');
  }
  delete(): void {}
}
class StubModes extends ModePresetRegistryPort {
  list(): ModePresetRecord[] {
    return [];
  }
  findById(): ModePresetRecord | undefined {
    return undefined;
  }
  insert(_rec: ModePresetInsert): ModePresetRecord {
    throw new Error('not used');
  }
  update(_orgId: string, _id: string, _patch: ModePresetPatch): ModePresetRecord {
    throw new Error('not used');
  }
  delete(): void {}
  ensureSeeded(): void {}
}

export function buildUseCase(store: MemoryApprovalStore, events: MemoryApprovalEvents) {
  return new RespondRunUseCase(
    new StubThreads(),
    new StubExecutor(),
    new StubClaims(),
    new StubHub(),
    new StubAgents(),
    new StubModes(),
    store,
    events,
    new StubFileRules(),
    new StubMachineConfig(),
    new StubSourceLocation(),
  );
}
