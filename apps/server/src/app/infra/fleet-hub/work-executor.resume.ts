import type { Logger } from '@harnesys/brix';
import type { OrgNodeIdentity, TaskEnvelope } from '@harnesys/contracts';
import {
  createRunEventBus,
  createRunEventFeed,
  InMemoryRunEventStore,
  InMemoryRunLifecycleStore,
  type PackRegistration,
  type ProcessJobTarget,
  type SessionEvent,
  type SessionHandle,
  type SkillRegistry,
} from 'harnesys';
import { type OrgSqliteDb, openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import type { OrgPluginWiring } from '../runtime/org-plugin-wiring.ts';
import { wireOrgPlugins } from '../runtime/org-plugin-wiring.ts';
import { wireOrgPacks } from '../runtime/packs/wire-org-packs.ts';
import { SqliteRuntimeState } from '../runtime/sqlite-runtime-state.adapter.ts';
import { createPlacedRunStack, type PlacedRunStack } from './work-executor.claimer.ts';
import {
  agentDefinitionOf,
  applyEnvelopeShellSpec,
  placedAgentsResolve,
  placedWireDeps,
  runSkillsOf,
} from './work-executor.compose.ts';
import { ensurePlacedProcess } from './work-executor.process.ts';
import {
  type PlacedAskResume,
  type PlacedRunGate,
  type PlaceRunHandle,
  resolvePlacedSecrets,
  type WorkExecutorDeps,
  wirePlacedResponder,
} from './work-executor.ts';
import {
  awaitTerminal,
  notifyWorkerRunFailed,
  prepareWorkerTarget,
  prepareWorkerTargetOf,
  startEventForwarder,
  wipeSecrets,
} from './work-executor.util.ts';

export interface ResumePlacedRunInput {
  identity: OrgNodeIdentity;
  envelope: TaskEnvelope;
  resume: PlacedAskResume;
  sendFrame: (payload: string) => void;
  persistEvents?: (events: SessionEvent[]) => void;

  relayLastSeq: number;

  leaseEpoch: number;
}

export function resumePlacedRun(
  deps: WorkExecutorDeps,
  input: ResumePlacedRunInput,
  onSettled?: () => void,
): PlaceRunHandle {
  const log = deps.logger.child('work-executor-resume');
  const active: PlacedRunGate = {
    cancelled: false,
    stopEngine: null,
    respond: null,
    queued: [],
  };
  void runResumed(deps, input, active, log)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(
        { orgId: input.identity.orgId, runId: input.envelope.runId, err: message },
        'placed run resume failed',
      );
      notifyWorkerRunFailed({
        runId: input.envelope.runId,
        leaseEpoch: input.leaseEpoch,
        relayLastSeq: input.relayLastSeq,
        reason: `resume failed: ${message.slice(0, 160)}`,
        sendFrame: input.sendFrame,
        ...(input.persistEvents ? { persistEvents: input.persistEvents } : {}),
      });
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

async function runResumed(
  deps: WorkExecutorDeps,
  input: ResumePlacedRunInput,
  active: PlacedRunGate,
  log: Logger,
): Promise<void> {
  const { identity, envelope, resume } = input;
  const orgId = identity.orgId;
  const runId = envelope.runId;
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
    const state = new SqliteRuntimeState(envelope.threadId, runId, orgSession.db);
    if (!(await isResumableSnapshot(state, resume, input))) {
      return;
    }
    const env = await prepareResumedTarget(deps, orgId, envelope, agent, orgSession.db);
    const { claimer, engine, runtime } = await createPlacedRunStack({
      deps,
      orgId,
      agentId: envelope.agentId,
      ...(agent.name ? { agentName: agent.name } : {}),
      agentSources: agent,
      threadId: envelope.threadId,
      agentDef,
      prepared: env.prepared,
      modelsPort,
      agentsResolve,
      packRegistrations: env.packRegistrations,
      lifecycle,
      events,
      feed,
      instanceId,
      state,
      ...(env.plugin !== undefined ? { plugin: env.plugin } : {}),
      ...(env.skills !== undefined ? { skills: env.skills } : {}),
      ...(env.process !== undefined ? { process: env.process } : {}),
    });
    active.stopEngine = () => engine.stop();
    await parkRestoredRun(lifecycle, events, envelope, resume.askId, input.relayLastSeq);
    await deliverResume({
      active,
      log,
      agentDef,
      envelope,
      input,
      stack: { claimer, engine, runtime, state },
      lifecycle,
      events,
      feed,
      prepared: env.prepared,
      state,
    });
    wipeSecrets(secretValues);
    wipeSecrets(resolved);
  } finally {
    orgSession.close();
  }
}

async function isResumableSnapshot(
  state: SqliteRuntimeState,
  resume: PlacedAskResume,
  input: ResumePlacedRunInput,
): Promise<boolean> {
  const snap = await state.load();
  const interruptId = snap?.cursor.interrupt?.interruptId;
  if (snap && snap.status === 'needs_input' && interruptId === resume.askId) {
    return true;
  }
  notifyWorkerRunFailed({
    runId: input.envelope.runId,
    leaseEpoch: input.leaseEpoch,
    relayLastSeq: input.relayLastSeq,
    reason: snap
      ? `stale ask ${resume.askId}: run is ${snap.status}${interruptId ? ` (waiting for ${interruptId})` : ''}`
      : 'run snapshot is missing on worker',
    sendFrame: input.sendFrame,
    ...(input.persistEvents ? { persistEvents: input.persistEvents } : {}),
  });
  return false;
}

interface ResumedTargetEnv {
  packRegistrations: PackRegistration[];
  plugin: OrgPluginWiring | undefined;
  prepared: ReturnType<typeof prepareWorkerTarget>;
  process: ProcessJobTarget | undefined;
  skills: SkillRegistry | undefined;
}

async function prepareResumedTarget(
  deps: WorkExecutorDeps,
  orgId: string,
  envelope: TaskEnvelope,
  agent: { sharedSourceIds: string[]; config: Record<string, unknown> },
  db: OrgSqliteDb,
): Promise<ResumedTargetEnv> {
  const { registrations: packRegistrations } = wireOrgPacks(placedWireDeps(deps, orgId, db));
  const plugin = deps.plugins === undefined ? undefined : await wireOrgPlugins(deps.plugins, orgId);
  const prepared = prepareWorkerTargetOf(deps, orgId, envelope, agent);
  const process = await ensurePlacedProcessSafe(deps, orgId, envelope, prepared);
  const skills = await runSkillsOf(deps, plugin, orgId, prepared);
  return { packRegistrations, plugin, prepared, process, skills };
}

async function ensurePlacedProcessSafe(
  deps: WorkExecutorDeps,
  orgId: string,
  envelope: TaskEnvelope,
  prepared: ReturnType<typeof prepareWorkerTarget>,
): Promise<ProcessJobTarget | undefined> {
  try {
    return await ensurePlacedProcess({
      deps,
      orgId,
      envelope,
      prepared: { agentId: envelope.agentId, paths: prepared.paths },
    });
  } catch (err) {
    throw new Error(
      `workspace container ensure failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function parkRestoredRun(
  lifecycle: InMemoryRunLifecycleStore,
  events: InMemoryRunEventStore,
  envelope: TaskEnvelope,
  askId: string,
  relayLastSeq: number,
): Promise<void> {
  events.nextSeq.set(envelope.runId, relayLastSeq);
  const created = await lifecycle.create({
    runId: envelope.runId,
    threadId: envelope.threadId,
    attribution: envelope.attribution,
  });
  const record = lifecycle.runs.get(envelope.runId);
  if (record) {
    record.lastSeq = relayLastSeq;
  }
  await lifecycle.transition(envelope.runId, created.leaseEpoch, {
    from: 'queued',
    to: 'needs_input',
    interruptId: askId,
    events: [],
  });
}

interface DeliverResumeArgs {
  active: PlacedRunGate;
  log: Logger;
  agentDef: ReturnType<typeof agentDefinitionOf>;
  envelope: TaskEnvelope;
  input: ResumePlacedRunInput;
  stack: PlacedRunStack;
  lifecycle: InMemoryRunLifecycleStore;
  events: InMemoryRunEventStore;
  feed: ReturnType<typeof createRunEventFeed>;
  prepared: ReturnType<typeof prepareWorkerTarget>;
  state: SqliteRuntimeState;
}

async function deliverResume(args: DeliverResumeArgs): Promise<void> {
  const { active, log, agentDef, envelope, input, stack } = args;
  const runId = envelope.runId;
  const forwarder = startEventForwarder({
    feed: args.feed,
    runId,
    leaseEpoch: input.leaseEpoch,
    fromSeq: input.relayLastSeq,
    sendFrame: input.sendFrame,
    isCancelled: () => active.cancelled,
    ...(input.persistEvents ? { persistEvents: input.persistEvents } : {}),
  });
  const session = stack.runtime.session(agentDef, {
    state: args.state,
    permissions: args.prepared.permissions,
    paths: {
      allow: args.prepared.paths.allow,
      cwd: args.prepared.paths.cwd,
      threadDir: args.prepared.threadDir,
    },
  });
  wirePlacedResponder({
    active,
    lifecycle: args.lifecycle,
    events: args.events,
    feed: args.feed,
    envelope,
    session,
  });
  try {
    if (active.cancelled) {
      return;
    }
    await deliverAnswer(session, runId, input.resume);
    stack.claimer.kick();
    await awaitTerminal(args.lifecycle, runId, () => active.cancelled);
  } finally {
    active.respond = null;
    forwarder.stop();
    stack.claimer.stop();
    stack.engine.stop();
    await Promise.resolve(stack.runtime.close());
    log.info({ orgId: input.identity.orgId, runId }, 'placed run resumed and finished');
  }
}

function deliverAnswer(
  session: SessionHandle,
  runId: string,
  resume: PlacedAskResume,
): Promise<void> {
  if (resume.action === 'reject') {
    return session.reject(runId, resume.askId, {
      ...(resume.note !== undefined ? { note: resume.note } : {}),
      ...(resume.clientEventId !== undefined ? { clientEventId: resume.clientEventId } : {}),
    });
  }
  return session.respond(runId, resume.askId, resume.payload, {
    ...(resume.clientEventId !== undefined ? { clientEventId: resume.clientEventId } : {}),
  });
}
