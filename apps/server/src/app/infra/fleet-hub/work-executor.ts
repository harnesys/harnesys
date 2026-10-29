import type { Logger } from '@harnesys/brix';
import type { OrgNodeIdentity, TaskEnvelope } from '@harnesys/contracts';
import {
  createRunEventBus,
  createRunEventFeed,
  InMemoryRunEventStore,
  InMemoryRunLifecycleStore,
  type ModelsPort,
  type ProcessJobTarget,
  type SessionHandle,
} from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { createOrgModelsPort } from '../runtime/org-models.port.ts';
import { wireOrgPlugins } from '../runtime/org-plugin-wiring.ts';
import { wireOrgPacks } from '../runtime/packs/wire-org-packs.ts';
import { providerApiKeySecretNames } from '../runtime/secret-resolver.adapter.ts';
import { SqliteRuntimeState } from '../runtime/sqlite-runtime-state.adapter.ts';
import { createFleetSecretResolver } from './fleet-secret-resolver.ts';
import { rejectPlacedRun } from './reject-placed-run.ts';
import { createPlacedRunStack } from './work-executor.claimer.ts';
import {
  agentDefinitionOf,
  applyEnvelopeShellSpec,
  type PlacedAskResume,
  type PlaceRunHandle,
  type PlaceRunInput,
  placedAgentsResolve,
  placedWireDeps,
  runSkillsOf,
  type WorkExecutorDeps,
} from './work-executor.compose.ts';
import { startPlacedForwarder } from './work-executor.forwarder.ts';
import { ensurePlacedProcess } from './work-executor.process.ts';
import {
  awaitTerminal,
  MemorySecretStore,
  prepareWorkerTarget,
  secretValuesFromResolved,
  uniqueNames,
  wipeSecrets,
} from './work-executor.util.ts';

export type {
  CreatePlacedRuntime,
  PlacedAskResume,
  PlaceRunHandle,
  PlaceRunInput,
  WorkExecutorDeps,
} from './work-executor.compose.ts';

export function executePlacedRun(
  deps: WorkExecutorDeps,
  input: PlaceRunInput,
  onSettled?: () => void,
): PlaceRunHandle {
  const log = deps.logger.child('work-executor');
  const active: PlacedRunGate = {
    cancelled: false,
    stopEngine: null,
    respond: null,
    queued: [],
  };
  void runPlaced(deps, input, active, log)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(
        {
          orgId: input.identity.orgId,
          runId: input.envelope.runId,
          err: message,
        },
        'placed run failed',
      );
      rejectPlacedRun(input, message.slice(0, 200) || 'placed_run_failed');
    })
    .finally(() => onSettled?.());
  return {
    cancel() {
      active.cancelled = true;
      active.stopEngine?.();
    },
    resumeAsk(resume) {
      if (active.respond) {
        return active.respond(resume);
      }
      active.queued.push(resume);
      return Promise.resolve();
    },
  };
}

export interface PlacedRunGate {
  cancelled: boolean;
  stopEngine: null | (() => void);
  respond: null | ((resume: PlacedAskResume) => Promise<void>);
  queued: PlacedAskResume[];
}

async function ensurePlacedProcessHandled(args: {
  deps: WorkExecutorDeps;
  runInput: PlaceRunInput;
  orgId: string;
  log: Logger;
  preparedPaths: { cwd: string; threadDir: string };
}): Promise<ProcessJobTarget | undefined> {
  try {
    return await ensurePlacedProcess({
      deps: args.deps,
      orgId: args.orgId,
      envelope: args.runInput.envelope,
      prepared: { agentId: args.runInput.envelope.agentId, paths: args.preparedPaths },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    args.log.warn(
      { orgId: args.orgId, runId: args.runInput.envelope.runId, err: message },
      'workspace container ensure failed',
    );
    rejectPlacedRun(args.runInput, message.slice(0, 200) || 'workspace_container_failed');
    return undefined;
  }
}

async function runPlaced(
  deps: WorkExecutorDeps,
  input: PlaceRunInput,
  active: PlacedRunGate,
  log: Logger,
): Promise<void> {
  const { identity, envelope, sendFrame } = input;
  const orgId = identity.orgId;
  const agent = deps.agents.findById(orgId, envelope.agentId);
  if (!agent) {
    throw new Error(`agent ${envelope.agentId} not found on worker`);
  }
  const agentDef = agentDefinitionOf(deps, orgId, agent);
  applyEnvelopeShellSpec(agentDef, agent, envelope);
  const { resolved, secretValues, modelsPort } = await resolvePlacedSecrets({
    deps,
    orgId,
    identity,
    envelope,
    agent,
  });

  const events = new InMemoryRunEventStore();
  const lifecycle = new InMemoryRunLifecycleStore(events);
  const feed = createRunEventFeed({ events, lifecycle, bus: createRunEventBus() });
  const instanceId = `worker-${identity.nodeId}`;
  const agentsResolve = placedAgentsResolve(deps, orgId);

  const orgSession = openOrgSqlite(deps.layout, orgId);
  try {
    const { registrations: packRegistrations } = wireOrgPacks(
      placedWireDeps(deps, orgId, orgSession.db),
    );
    const plugin =
      deps.plugins === undefined ? undefined : await wireOrgPlugins(deps.plugins, orgId);
    const prepared = prepareWorkerTarget({
      layout: deps.layout,
      machineConfig: deps.machineConfig,
      sources: deps.sources,
      sourceLocation: deps.sourceLocation,
      orgId,
      threadId: envelope.threadId,
      agent,
      ...(envelope.directory ? { directory: envelope.directory } : {}),
      ...(envelope.sourceId ? { sourceId: envelope.sourceId } : {}),
      ...(envelope.worktreeId ? { worktreeId: envelope.worktreeId } : {}),
    });
    const process = await ensurePlacedProcessHandled({
      deps,
      runInput: input,
      orgId,
      log,
      preparedPaths: prepared.paths,
    });
    if (process === undefined) {
      return;
    }
    const skills = await runSkillsOf(deps, plugin, orgId, prepared);
    const state = new SqliteRuntimeState(envelope.threadId, envelope.runId, orgSession.db);
    const { claimer, engine, runtime } = await createPlacedRunStack({
      deps,
      orgId,
      agentId: envelope.agentId,
      ...(agent.name ? { agentName: agent.name } : {}),
      agentSources: agent,
      threadId: envelope.threadId,
      agentDef,
      prepared,
      modelsPort,
      agentsResolve,
      packRegistrations,
      lifecycle,
      events,
      feed,
      instanceId,
      state,
      ...(plugin !== undefined ? { plugin } : {}),
      ...(skills !== undefined ? { skills } : {}),
      ...(process !== undefined ? { process } : {}),
    });
    active.stopEngine = () => engine.stop();

    const forwarder = await startPlacedForwarder({
      input,
      envelope,
      events,
      lifecycle,
      feed,
      sendFrame,
      active,
    });
    const session = runtime.session(agentDef, {
      state,
      permissions: prepared.permissions,
      paths: {
        allow: prepared.paths.allow,
        cwd: prepared.paths.cwd,
        threadDir: prepared.threadDir,
      },
    });
    wirePlacedResponder({ active, lifecycle, events, feed, envelope, session });

    try {
      if (active.cancelled) {
        return;
      }
      claimer.kick();
      await awaitTerminal(lifecycle, envelope.runId, () => active.cancelled);
    } finally {
      active.respond = null;
      forwarder.stop();
      claimer.stop();
      engine.stop();
      await Promise.resolve(runtime.close());
      await plugin?.close();
      wipeSecrets(secretValues);
      wipeSecrets(resolved);
      log.info({ orgId, runId: envelope.runId }, 'placed run finished');
    }
  } finally {
    orgSession.close();
  }
}

export async function resolvePlacedSecrets(args: {
  deps: WorkExecutorDeps;
  orgId: string;
  identity: OrgNodeIdentity;
  envelope: TaskEnvelope;
  agent: AgentRecord;
}): Promise<{
  resolved: Record<string, string>;
  secretValues: Record<string, string>;
  modelsPort: ModelsPort;
}> {
  const { deps, orgId, identity, envelope, agent } = args;
  const fleetResolver = createFleetSecretResolver({
    relayUrl: identity.relayUrl,
    orgId,
    token: identity.token,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  const names = uniqueNames([
    ...envelope.secretNames,
    ...envelope.varNames,
    ...providerApiKeySecretNames(orgId, agent, deps.providers, deps.models),
  ]);
  const resolved = await fleetResolver.resolve(names, {
    runId: envelope.runId,
    agentId: envelope.agentId,
  });
  const secretValues = secretValuesFromResolved(resolved);
  const secrets = new MemorySecretStore(secretValues);
  const modelsPort =
    deps.modelsPort ?? createOrgModelsPort(orgId, deps.providers, deps.models, secrets);
  return { resolved, secretValues, modelsPort };
}

export function wirePlacedResponder(args: {
  active: PlacedRunGate;
  lifecycle: InMemoryRunLifecycleStore;
  events: InMemoryRunEventStore;
  feed: ReturnType<typeof createRunEventFeed>;
  envelope: TaskEnvelope;
  session: SessionHandle;
}): void {
  const { active, lifecycle, events, feed, envelope, session } = args;
  active.respond = async (resume) => {
    const before = (await lifecycle.get(envelope.runId))?.lastSeq ?? 0;
    if (resume.action === 'reject') {
      await session.reject(envelope.runId, resume.askId, {
        note: resume.note,
        clientEventId: resume.clientEventId,
      });
    } else {
      await session.respond(envelope.runId, resume.askId, resume.payload, {
        clientEventId: resume.clientEventId,
      });
    }
    const stored = await events.tail(envelope.runId, before);
    if (stored.length > 0) {
      feed.publish(envelope.runId, stored);
    }
  };
  const pending = active.queued.splice(0);
  for (const resume of pending) {
    void active.respond(resume);
  }
}
