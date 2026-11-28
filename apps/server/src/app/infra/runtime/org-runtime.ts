import {
  CONSOLE_LOGGER,
  createRunClaimer,
  createRunEngine,
  createRunEventBus,
  createRunEventFeed,
  createRuntime,
  type RunClaimer,
  type RunEngine,
  type RuntimeHandle,
  type SessionHandle,
} from 'harnesys';
import { createOrgModelsPort } from '../../domain/provider/org-models.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ApprovalResumeSweep, createApprovalResumeSweep } from './approval-resume-sweep.ts';
import { createAwaitSignalCheck } from './await-signal-resolvers.ts';
import { createBranchSeed } from './branch-state-seed.ts';
import { runInHostToolScope } from './host-tool-scope.ts';
import { wireOrgPlugins } from './org-plugin-wiring.ts';
import { createOrgRunStores } from './org-run-stores.ts';
import type { OrgRuntime, OrgRuntimeDeps } from './org-runtime.types.ts';
import { createAgentsResolve } from './org-runtime-agents.ts';
import { createOrgCompactGuard } from './org-runtime-compact-guard.ts';
import { compactRequestDepsOf, requestThreadCompact } from './org-runtime-compact-request.ts';
import { createCompactionChannel } from './org-runtime-compaction-channel.ts';
import { createOrgEventPublisher } from './org-runtime-publish.ts';
import {
  createSteeringChannel,
  createThreadQueueDrainer,
  drainThreadQueueSoon,
} from './org-runtime-queue.ts';
import { createBackgroundReportFn, createOrgRunControl } from './org-runtime-run-control.ts';
import { createRunTargetResolver } from './org-runtime-run-target.ts';
import { cancelThreadRun, retryThreadRun, sendThreadMessage } from './org-runtime-runs.ts';
import { prepareSessionTarget } from './org-runtime-session-target.ts';
import { orgPackInputs, wireOrgPacks } from './packs/wire-org-packs.ts';
import { scopeOf, type TargetCache } from './prepare-org-target.ts';
import { recoverIssueExecutionsIfPresent } from './recover-issue-executions.ts';
import { recoverOrphanedRuns } from './recover-orphaned-runs.ts';
import { recoverStaleWorktrees } from './recover-stale-worktrees.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.adapter.ts';
import { threadSessionKey } from './thread-session-key.ts';
import {
  removeThreadHistoryEvent,
  truncateThreadHistory,
  undoThreadCompaction,
} from './truncate-thread-state.ts';
import { createWaitTicker, type ThreadSessionRef } from './wait-ticker.ts';
import { reconcileWorkspaces } from './workspace-target.ts';

const WAITING_RUNS_SQL = `SELECT COUNT(*) AS c FROM runs WHERE status = 'waiting' AND wait_fire_at IS NOT NULL`;

export async function openOrgRuntime(deps: OrgRuntimeDeps): Promise<OrgRuntime> {
  const session = openOrgSqlite(deps.layout, deps.orgId);
  const targetCache: TargetCache = new Map();
  const eventBus = createRunEventBus({
    onPublish: createOrgEventPublisher({
      orgId: deps.orgId,
      db: session.db,
      threadDirOf: (threadId) => deps.layout.threadDir(deps.orgId, threadId),
      ...(deps.threadEvents === undefined ? {} : { threadEvents: deps.threadEvents }),
      ...(deps.logger === undefined ? {} : { logger: deps.logger }),
    }),
  });
  const stores = createOrgRunStores(
    deps,
    session,
    {
      targetCache,
    },
    (threadId, runId, events) => eventBus.publish(threadId, runId, events),
  );
  const { runEvents, runLifecycle, reconcileApprovals, shouldReap } = stores;
  const resumedRuns = await recoverOrphanedRuns({ db: session.db, lifecycle: runLifecycle });
  await recoverIssueExecutionsIfPresent({
    orgId: deps.orgId,
    executions: deps.issueExecutions,
    lifecycle: runLifecycle,
  });
  if (deps.worktrees && deps.sourceDriver) {
    await recoverStaleWorktrees({
      orgId: deps.orgId,
      worktrees: deps.worktrees,
      driver: deps.sourceDriver,
      layout: deps.layout,
      machineConfig: deps.machineConfig,
    }).catch(() => {});
  }
  reconcileWorkspaces(deps);
  const feed = createRunEventFeed({
    events: runEvents,
    lifecycle: runLifecycle,
    bus: eventBus,
  });
  const instanceId = `relay-${deps.machineConfig.get().id}`;
  const modelsPort = createOrgModelsPort(deps.orgId, deps.providers, deps.models, deps.secrets);
  const threadSessions = new Map<string, ThreadSessionRef>();
  const sessionRequested = new Map<string, string[]>();
  const sessionRequestedModes = new Map<string, string | undefined>();
  const engineSnapshot =
    deps.browserEngines !== undefined ? await deps.browserEngines.snapshot() : undefined;
  const plugin = await wireOrgPlugins(deps.plugins, deps.orgId);
  const { registrations: packRegistrations } = wireOrgPacks({
    ...orgPackInputs(deps, session.db, engineSnapshot, runEvents),
    baseRegistry: () => plugin.makeRegistry(),
  });
  const agentsResolve = createAgentsResolve(deps, plugin);

  let claimer: RunClaimer | undefined;
  const engine: RunEngine = createRunEngine({
    lifecycle: runLifecycle,
    events: runEvents,
    instanceId,
    delivery: () => {
      const delivery = deps.orgSettings.get(deps.orgId).delivery;
      return { liveFlushMs: delivery.liveFlushMs, journalBatch: delivery.journalBatch };
    },
    models: modelsPort,
    toolRegistry: plugin.makeRegistry(),
    skills: plugin.skills,
    toolMessages: 'ordered',
    agents: agentsResolve,
    packRegistrations,
    ...(deps.modelQuotaFactory ? { modelQuota: deps.modelQuotaFactory.forOrg(deps.orgId) } : {}),
    logger: CONSOLE_LOGGER,
    backgroundReport: createBackgroundReportFn(session.db, (threadId) =>
      drainThreadQueueSoon(drainMessageQueue, () => claimer?.kick(), threadId),
    ),
  });

  const agentRunControl = createOrgRunControl({
    engine,
    events: runEvents,
    db: session.db,
  });

  const steering = createSteeringChannel(session.db);
  const compaction = createCompactionChannel({ db: session.db, lifecycle: runLifecycle, feed });
  const resolveRunTarget = createRunTargetResolver({
    deps,
    plugin,
    agentsResolve,
    packRegistrations,
    requestedModes: sessionRequestedModes,
    targetCache,
    sessionRequested,
    events: runEvents,
    lifecycle: runLifecycle,
    feed,
    steering,
    compaction,
    runControl: agentRunControl,
  });

  const branchSeed = createBranchSeed({
    orgId: deps.orgId,
    db: session.db,
    sessions: threadSessions,
    threads: deps.threads,
    events: runEvents,
    lifecycle: runLifecycle,
    stateFactory: (threadId, runId) => new SqliteRuntimeState(threadId, runId, session.db),
  });
  const resumeSweep: ApprovalResumeSweep | undefined =
    deps.approvals && deps.claims && deps.commands
      ? createApprovalResumeSweep({
          db: session.db,
          orgId: deps.orgId,
          approvals: deps.approvals,
          claims: deps.claims,
          commands: deps.commands,
          lifecycle: runLifecycle,
          sessionFor,
          ...(deps.approvalEvents === undefined ? {} : { approvalEvents: deps.approvalEvents }),
          ...(deps.logger === undefined ? {} : { logger: deps.logger }),
        })
      : undefined;
  claimer = createRunClaimer({
    lifecycle: runLifecycle,
    engine,
    instanceId,
    withScope: (target, execute) => runInHostToolScope(scopeOf(deps.orgId, target), execute),
    targets: {
      resolve: (threadId, runId) =>
        branchSeed
          .seededRunState(threadId, runId ?? null)
          .then((state) => resolveRunTarget(threadId, state, { runId })),
    },
    onComplete: (record) =>
      drainThreadQueueSoon(drainMessageQueue, () => claimer?.kick(), record.threadId),
    onSweep: () => {
      void reconcileApprovals();
      void resumeSweep?.sweep();
    },
    shouldReap,
  });
  if (resumedRuns > 0) {
    claimer.kick();
  }

  const runtime: RuntimeHandle = await createRuntime({
    models: modelsPort,
    agents: agentsResolve,
    lifecycle: runLifecycle,
    events: runEvents,
    feed,
    claimer,
    instanceId,
    packs: packRegistrations,
    targets: {
      resolve: async (threadId, runId) => {
        const state = await branchSeed.seededRunState(threadId, runId ?? null);
        return resolveRunTarget(threadId, state, { runId });
      },
    },
    logger: CONSOLE_LOGGER,
  });

  async function sessionFor(threadId: string, agentId: string): Promise<SessionHandle> {
    const key = threadSessionKey(threadId, agentId);
    const existing = threadSessions.get(key);
    if (existing?.handle) {
      return existing.handle;
    }
    const prepared = prepareSessionTarget(deps, threadId, agentId, targetCache);
    if (!prepared) {
      throw new ThreadNotFoundException(threadId);
    }
    const state = await branchSeed.seededThreadState(threadId, agentId);
    const handle = Promise.resolve(
      runtime.session(prepared.agentDef, {
        state,
        permissions: prepared.permissions,
        paths: prepared.paths,
      }),
    );
    threadSessions.set(key, { state, handle });
    return handle;
  }

  const waitTicker = createWaitTicker({
    lifecycle: runLifecycle,
    events: runEvents,
    kick: () => claimer?.kick(),
    isAwaitSettled: createAwaitSignalCheck(deps.orgId, {
      issueExecutions: deps.issueExecutions,
      signals: deps.signals?.store,
    }),
    countWaitingTimers: () =>
      (session.sqlite.query(WAITING_RUNS_SQL).get() as { c: number } | undefined)?.c ?? 0,
    releaseGate: () => deps.waitGate?.release(deps.orgId),
  });

  const runControl = {
    lifecycle: runLifecycle,
    requestedSkills: sessionRequested,
    requestedModes: sessionRequestedModes,
    sessionFor,
    kick: () => claimer?.kick(),
  };

  const drainMessageQueue = createThreadQueueDrainer({
    db: session.db,
    lifecycle: runLifecycle,
    sessionFor,
    requestedSkills: sessionRequested,
    requestedModes: sessionRequestedModes,
    kick: runControl.kick,
  });
  const compactGuard = createOrgCompactGuard({
    runCompact: (threadId, guardSignal, onRun) =>
      requestThreadCompact(
        compactRequestDepsOf(deps, compaction, runLifecycle, runControl.kick),
        threadId,
        guardSignal,
        onRun,
      ),
    undo: (threadId) =>
      undoThreadCompaction(
        { lifecycle: runLifecycle, events: runEvents, sessions: threadSessions, sessionFor },
        threadId,
      ),
  });
  return {
    orgId: deps.orgId,
    lifecycle: runLifecycle,
    events: runEvents,
    feed,
    sessionFor,
    send: (input) => sendThreadMessage(runControl, input),
    compact: (threadId, signal, onRun) => compactGuard.compact(threadId, signal, onRun),
    cancelCompact: (threadId) => compactGuard.cancelCompact(threadId),
    undoThreadCompact: (threadId) => compactGuard.undoThreadCompact(threadId),
    drainMessageQueue,
    cancel: (runId) =>
      cancelThreadRun({ ...runControl, abortRun: (id) => engine.abort(id) }, runId),
    retry: (runId) => retryThreadRun(runControl, runId),
    stream(runId, fromSeq = 0) {
      return feed.subscribe(runId, fromSeq);
    },
    async truncateThread(threadId, threadSeq) {
      return truncateThreadHistory(
        { lifecycle: runLifecycle, events: runEvents, sessions: threadSessions, sessionFor },
        threadId,
        threadSeq,
      );
    },
    async removeThreadEvent(threadId, threadSeq) {
      return removeThreadHistoryEvent(
        { events: runEvents, sessions: threadSessions },
        threadId,
        threadSeq,
      );
    },
    tickWaitTimers: () => waitTicker.tick(),
    wakeRuns: waitTicker.wake,
    listMcpServers: () => plugin.listMcp(),
    reloadMcp: (serverId, entry) => plugin.applyMcp(serverId, entry),
    close() {
      claimer?.stop();
      engine.stop();
      dispose();
    },
    closeWhenIdle() {
      claimer?.halt();
      void engine.whenIdle().then(() => {
        engine.stop();
        dispose();
      });
    },
  };

  function dispose(): void {
    void runtime.close();
    void plugin.close();
    session.close();
    threadSessions.clear();
    targetCache.clear();
    sessionRequested.clear();
    sessionRequestedModes.clear();
  }
}
