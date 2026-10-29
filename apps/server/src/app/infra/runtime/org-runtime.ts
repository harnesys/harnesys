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
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ApprovalResumeSweep, createApprovalResumeSweep } from './approval-resume-sweep.ts';
import { createBranchSeed } from './branch-state-seed.ts';
import { runInHostToolScope } from './host-tool-scope.ts';
import { createOrgModelsPort } from './org-models.port.ts';
import { wireOrgPlugins } from './org-plugin-wiring.ts';
import { createOrgRunStores } from './org-run-stores.ts';
import type { OrgRuntime, OrgRuntimeDeps } from './org-runtime.types.ts';
import { createAgentsResolve } from './org-runtime-agents.ts';
import { compactThread } from './org-runtime-compact.ts';
import { createSteeringChannel, createThreadQueueDrainer } from './org-runtime-queue.ts';
import { createRunTargetResolver } from './org-runtime-run-target.ts';
import { cancelThreadRun, retryThreadRun, sendThreadMessage } from './org-runtime-runs.ts';
import { orgPackInputs, wireOrgPacks } from './packs/wire-org-packs.ts';
import { prepareTarget, scopeOf, type TargetCache } from './prepare-org-target.ts';
import { recoverIssueExecutionsIfPresent } from './recover-issue-executions.ts';
import { recoverOrphanedRuns } from './recover-orphaned-runs.ts';
import { recoverStaleWorktrees } from './recover-stale-worktrees.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.adapter.ts';
import { removeThreadHistoryEvent, truncateThreadHistory } from './truncate-thread-state.ts';
import { sweepWaitTimers, type ThreadSessionRef } from './wait-ticker.ts';
import { reconcileWorkspaces, type ThreadBinding } from './workspace-target.ts';

export async function openOrgRuntime(deps: OrgRuntimeDeps): Promise<OrgRuntime> {
  const session = openOrgSqlite(deps.layout, deps.orgId);
  const worktreeBindings = new Map<string, ThreadBinding>();
  const targetCache: TargetCache = new Map();
  const stores = createOrgRunStores(deps, session, {
    targetCache,
    worktreeBindings,
  });
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
  const eventBus = createRunEventBus();
  const feed = createRunEventFeed({
    events: runEvents,
    lifecycle: runLifecycle,
    bus: eventBus,
  });
  const instanceId = `relay-${deps.machineConfig.get().id}`;
  const modelsPort = createOrgModelsPort(deps.orgId, deps.providers, deps.models, deps.secrets);
  const threadSessions = new Map<string, ThreadSessionRef>();
  const sessionRequested = new Map<string, string[]>();
  const engineSnapshot =
    deps.browserEngines !== undefined ? await deps.browserEngines.snapshot() : undefined;
  const { registrations: packRegistrations } = wireOrgPacks(
    orgPackInputs(deps, session.db, engineSnapshot),
  );

  const plugin = await wireOrgPlugins(deps.plugins, deps.orgId);
  const agentsResolve = createAgentsResolve(deps, plugin);

  let claimer: RunClaimer | undefined;
  const engine: RunEngine = createRunEngine({
    lifecycle: runLifecycle,
    events: runEvents,
    feed,
    instanceId,
    models: modelsPort,
    toolRegistry: plugin.makeRegistry(),
    skills: plugin.skills,
    toolMessages: 'ordered',
    agents: agentsResolve,
    packRegistrations,
    logger: CONSOLE_LOGGER,
  });

  const steering = createSteeringChannel(session.db);
  const resolveRunTarget = createRunTargetResolver({
    deps,
    plugin,
    agentsResolve,
    packRegistrations,
    worktreeBindings,
    targetCache,
    sessionRequested,
    events: runEvents,
    feed,
    steering,
  });

  const branchSeed = createBranchSeed({
    orgId: deps.orgId,
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
          .then((state) => resolveRunTarget(threadId, state)),
    },
    onComplete: (record) =>
      void drainMessageQueue(record.threadId)
        .then((result) => {
          if (result.status === 'busy') {
            claimer?.kick();
          }
        })
        .catch(() => {}),
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
        return resolveRunTarget(threadId, state);
      },
    },
    logger: CONSOLE_LOGGER,
  });

  async function sessionFor(threadId: string): Promise<SessionHandle> {
    const existing = threadSessions.get(threadId);
    if (existing?.handle) {
      return existing.handle;
    }
    const prepared = prepareTarget(deps, threadId, targetCache, worktreeBindings.get(threadId));
    if (!prepared) {
      throw new ThreadNotFoundException(threadId);
    }
    const state = await branchSeed.seededThreadState(threadId);
    const handle = Promise.resolve(
      runtime.session(prepared.agentDef, {
        state,
        permissions: prepared.permissions,
        paths: prepared.paths,
      }),
    );
    threadSessions.set(threadId, { state, handle });
    return handle;
  }

  async function tickWaitTimers(): Promise<number> {
    const resumed = await sweepWaitTimers({
      lifecycle: runLifecycle,
      events: runEvents,
      kick: () => claimer?.kick(),
    });
    const row = session.sqlite
      .query(`SELECT COUNT(*) AS c FROM runs WHERE status = 'waiting' AND wait_fire_at IS NOT NULL`)
      .get() as { c: number } | undefined;
    if (deps.waitGate && (row?.c ?? 0) === 0) {
      deps.waitGate.release(deps.orgId);
    }
    return resumed;
  }

  const runControl = {
    lifecycle: runLifecycle,
    requestedSkills: sessionRequested,
    worktreeBindings,
    sessionFor,
    kick: () => claimer?.kick(),
  };

  const drainMessageQueue = createThreadQueueDrainer({
    db: session.db,
    lifecycle: runLifecycle,
    sessionFor,
    requestedSkills: sessionRequested,
    worktreeBindings,
    kick: runControl.kick,
  });
  return {
    orgId: deps.orgId,
    lifecycle: runLifecycle,
    events: runEvents,
    feed,
    sessionFor,
    send: (input) => sendThreadMessage(runControl, input),
    compact: (threadId) =>
      compactThread(
        {
          models: modelsPort,
          events: runEvents,
          seededThreadState: (id) => branchSeed.seededThreadState(id),
          resolveRunTarget,
        },
        threadId,
      ),
    drainMessageQueue,
    cancel: (runId) =>
      cancelThreadRun({ ...runControl, abortRun: (id) => engine.abort(id) }, runId),
    retry: (runId) => retryThreadRun(runControl, runId),
    stream(runId, fromSeq = 0) {
      return feed.subscribe(runId, fromSeq);
    },
    async truncateThread(threadId, runId, seq) {
      return truncateThreadHistory(
        { lifecycle: runLifecycle, events: runEvents, sessions: threadSessions, sessionFor },
        threadId,
        runId,
        seq,
      );
    },
    async removeThreadEvent(threadId, runId, seq) {
      return removeThreadHistoryEvent(
        { events: runEvents, sessions: threadSessions },
        threadId,
        runId,
        seq,
      );
    },
    tickWaitTimers,
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
    worktreeBindings.clear();
  }
}
