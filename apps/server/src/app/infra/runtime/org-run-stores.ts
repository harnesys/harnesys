import type { RunEventStore, RunLifecycleStore, RunRecord } from 'harnesys';
import { CONSOLE_LOGGER } from 'harnesys';
import { ConsolidateThreadUseCase } from '../../application/use-cases/memory/consolidate-thread.use-case.ts';
import { PromoteFactsUseCase } from '../../application/use-cases/memory/promote-facts.use-case.ts';
import { findDecisionModelCoords } from '../../application/use-cases/memory/promote-triage.ts';
import { ReflectThreadUseCase } from '../../application/use-cases/memory/reflect-thread.use-case.ts';
import { observeCancelledRun } from '../../domain/approval/cancelled-run-approvals.ts';
import { observeParks, type ParkFileRuntime } from '../../domain/approval/park-observer.ts';
import { resolveProviderApiKey } from '../../domain/secret/provider-api-key.ts';
import { StudioEmbeddings } from '../knowledge/embeddings.ts';
import { decisionModelIdOf, embedModelIdOf } from '../memory/org-memory-settings.store.ts';
import type { OrgSqliteDb, OrgSqliteSession } from '../org-sqlite/org-sqlite-session.ts';
import { createApprovalReconcile, runStatusOf } from './approval-reconcile.ts';
import { observeRunTerminal } from './observe-run-terminal.ts';
import { observeThreadErrors } from './observe-thread-errors.ts';
import { createOrgModelsPort } from './org-models.port.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import { OrgEpisodicPort } from './packs/org-episodic.port.ts';
import type { TargetCache } from './prepare-org-target.ts';
import { prepareUsageEvents } from './prepare-usage-events.ts';
import { requestApprovalForPark } from './request-approval-for-park.ts';
import { SqliteRunEventStore } from './sqlite-run-events.adapter.ts';
import { SqliteRunLifecycleStore } from './sqlite-run-lifecycle.adapter.ts';
import { withWaitGateSignal } from './wait-ticker.ts';
import type { ThreadBinding } from './workspace-target.ts';

export interface OrgRunStores {
  runEvents: RunEventStore;
  runLifecycle: RunLifecycleStore;
  reconcileApprovals: () => Promise<void>;
  shouldReap: (record: RunRecord) => Promise<boolean>;
}

export interface OrgParkRuntimeDeps {
  targetCache: TargetCache;
  worktreeBindings: Map<string, ThreadBinding>;
}

export function createOrgRunStores(
  deps: OrgRuntimeDeps,
  session: OrgSqliteSession,
  parkRuntime?: OrgParkRuntimeDeps,
): OrgRunStores {
  const modelsPort = createOrgModelsPort(deps.orgId, deps.providers, deps.models, deps.secrets);
  let consolidate: ConsolidateThreadUseCase | undefined;
  const consolidationQueues = new Map<string, Promise<void>>();
  const fileRuntime =
    parkRuntime &&
    ((threadId: string): ParkFileRuntime | undefined => {
      const cwd = parkRuntime.targetCache.get(threadId)?.cwd;
      if (cwd === undefined) {
        return undefined;
      }
      return {
        host: deps.machineConfig.get().id,
        cwd,
        runtime:
          parkRuntime.worktreeBindings.get(threadId)?.isolation?.mode === 'container'
            ? 'container'
            : 'host',
      };
    });
  const reconcile = createApprovalReconcile({
    db: session.db,
    orgId: deps.orgId,
    threads: deps.threads,
    ...(deps.approvals === undefined ? {} : { approvals: deps.approvals }),
    ...(deps.approvalEvents === undefined ? {} : { approvalEvents: deps.approvalEvents }),
    ...(deps.logger === undefined ? {} : { logger: deps.logger }),
    ...(fileRuntime === undefined ? {} : { fileRuntime }),
  });
  const runEvents = new SqliteRunEventStore(session.db, {
    prepare: (tx, runId, threadId, events) => prepareUsageEvents(tx, runId, threadId, events),
    observe: (tx, runId, threadId, events) => {
      try {
        observeThreadErrors(
          tx,
          {
            orgId: deps.orgId,
            onEvent: (event) => deps.threadEvents?.emit(deps.orgId, event),
          },
          threadId,
          runId,
          events,
        );
      } catch {
        // thread error surfacing is best-effort
      }

      // adapters open their own sqlite connection and would hit SQLITE_BUSY
      // against this transaction's write lock. Defer until after commit.
      queueMicrotask(() => {
        observeRunTerminal(
          {
            orgId: deps.orgId,
            logger: CONSOLE_LOGGER,
            ...(deps.issueExecutions ? { issueExecutions: deps.issueExecutions } : {}),
            ...(deps.worktrees ? { worktrees: deps.worktrees } : {}),
          },
          runId,
          events,
        );
      });
      if (deps.approvals) {
        observeCancelledRun(
          {
            approvals: deps.approvals,
            ...(deps.approvalEvents === undefined ? {} : { approvalEvents: deps.approvalEvents }),
          },
          deps.orgId,
          runId,
          events,
        );
      }
      if (events.some((event) => event.type === 'run.completed')) {
        consolidate ??= buildConsolidationUseCase(deps, session, modelsPort, runEvents);
        enqueueConsolidation(consolidationQueues, threadId, () => {
          const run = consolidate?.execute(deps.orgId, threadId, runId) ?? Promise.resolve();
          return run;
        });
      }
    },
  });
  const runLifecycle = withWaitGateSignal(
    new SqliteRunLifecycleStore(session.db, (tx, runId, threadId, events, context) => {
      const assigned = runEvents.appendWithinTx(tx, runId, threadId, events);
      const approvals = deps.approvals;
      if (context?.park === true && approvals) {
        observeParks(threadId, runId, assigned, (park) => {
          if (runStatusOf(session.db, runId) !== 'needs_input') {
            return;
          }
          try {
            const runtime = fileRuntime?.(threadId);
            requestApprovalForPark({
              orgId: deps.orgId,
              threads: deps.threads,
              approvals,
              approvalEvents: deps.approvalEvents,
              park,
              ...(runtime === undefined ? {} : { fileRuntime: runtime }),
            });
          } catch (error) {
            deps.logger
              ?.child('run-parks')
              .warn(
                { error, orgId: deps.orgId, runId, askId: park.askId },
                'park approval request failed',
              );
          }
        });
      }
      return assigned;
    }),
    () => deps.waitGate?.hold(deps.orgId),
  );
  return {
    runEvents,
    runLifecycle,
    reconcileApprovals: reconcile.reconcile,
    shouldReap: reconcile.shouldReap,
  };
}

function pinnedEmbeddingRef(
  deps: OrgRuntimeDeps,
  db: OrgSqliteDb,
): { provider: string; model: string } | undefined {
  const modelId = embedModelIdOf(db, deps.orgId);
  if (!modelId) {
    return undefined;
  }
  const model = deps.models.findById(deps.orgId, modelId);
  const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
  return model && provider ? { provider: provider.name, model: model.name } : undefined;
}

function modelCoordsOf(deps: OrgRuntimeDeps) {
  return (agent: { modelId: string }) => {
    const model = deps.models.findById(deps.orgId, agent.modelId);
    const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
    return model && provider
      ? { provider: provider.name, model: model.name, modelId: model.id }
      : undefined;
  };
}

function buildConsolidationUseCase(
  deps: OrgRuntimeDeps,
  session: OrgSqliteSession,
  modelsPort: ReturnType<typeof createOrgModelsPort>,
  runEvents: RunEventStore,
): ConsolidateThreadUseCase {
  const embeddings = new StudioEmbeddings({
    providers: deps.providers,
    models: deps.models,
    orgId: deps.orgId,
    modelRef: pinnedEmbeddingRef(deps, session.db),
    resolveApiKey: (provider) =>
      resolveProviderApiKey(deps.secrets, deps.orgId, provider.id, provider.apiKey),
  });
  const agentModelCoords = modelCoordsOf(deps);
  const consolidateModelCoords = (modelId: string) => {
    const model = deps.models.findById(deps.orgId, modelId);
    const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
    return model && provider
      ? { provider: provider.name, model: model.name, modelId: model.id }
      : undefined;
  };
  return new ConsolidateThreadUseCase({
    db: session.db,
    models: modelsPort,
    events: runEvents,
    agents: deps.agents,
    logger: CONSOLE_LOGGER,
    embeddings,
    agentModelCoords,
    consolidateModelCoords,
    reflect: new ReflectThreadUseCase({
      db: session.db,
      models: modelsPort,
      events: runEvents,
      logger: CONSOLE_LOGGER,
      embeddings,
      episodic: new OrgEpisodicPort(session.db),
      agentModelCoords,
      consolidateModelCoords,
    }),
    promote: new PromoteFactsUseCase({
      db: session.db,
      agents: deps.agents,
      logger: CONSOLE_LOGGER,
      models: modelsPort,
      decisionCoords: () =>
        findDecisionModelCoords({
          orgId: deps.orgId,
          providers: deps.providers,
          models: deps.models,
          decisionModelId: decisionModelIdOf(session.db, deps.orgId),
        }),
    }),
  });
}

function enqueueConsolidation(
  queues: Map<string, Promise<void>>,
  threadId: string,
  task: () => Promise<void>,
): void {
  const tail = queues.get(threadId) ?? Promise.resolve();
  const chained = tail
    .then(task)
    .catch(() => {})
    .finally(() => {
      if (queues.get(threadId) === chained) {
        queues.delete(threadId);
      }
    });
  queues.set(threadId, chained);
}
