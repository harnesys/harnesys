import type { AgentSourceLevel } from '@harnesys/contracts';
import {
  type AgentDefinition,
  type AgentsResolve,
  type CapabilityScope,
  CONSOLE_LOGGER,
  createRunClaimer,
  createRunEngine,
  createRuntime,
  createToolRegistry,
  type FileAccessPolicy,
  type InMemoryRunEventStore,
  type InMemoryRunLifecycleStore,
  InMemoryRuntimeState,
  type ModelsPort,
  type PackRegistration,
  type PathsConfig,
  type PermissionMap,
  type ProcessJobTarget,
  type RunClaimer,
  type RunEngine,
  type RunEventFeed,
  type RuntimeHandle,
  type SkillRegistry,
} from 'harnesys';
import { runInHostToolScope } from '../runtime/host-tool-scope.ts';
import type { OrgPluginWiring } from '../runtime/org-plugin-wiring.ts';
import {
  runTargetFileAccess,
  runTargetFileAccessForAgent,
} from '../runtime/org-runtime-file-access.ts';
import type { WorkExecutorDeps } from './work-executor.compose.ts';
import type { prepareWorkerTarget } from './work-executor.util.ts';

interface PlacedClaimerInput {
  lifecycle: InMemoryRunLifecycleStore;
  engine: RunEngine;
  instanceId: string;
  state: InMemoryRuntimeState;
  agentDef: AgentDefinition;
  permissions: PermissionMap;
  paths: PathsConfig;
  cwd: string;
  packRegistrations: PackRegistration[];
  skills?: SkillRegistry;
  plugin?: OrgPluginWiring;
  scope: CapabilityScope;
  fileAccess?: FileAccessPolicy;
  fileAccessFor?: (agent: AgentDefinition) => FileAccessPolicy;
  process?: ProcessJobTarget;
}

export interface PlacedRunStack {
  claimer: RunClaimer;
  engine: RunEngine;
  runtime: Pick<RuntimeHandle, 'close' | 'session'>;
  state: InMemoryRuntimeState;
}

interface PlacedRunStackInput {
  deps: WorkExecutorDeps;
  orgId: string;
  agentId: string;
  agentName?: string;
  agentSources: { sharedSourceIds: string[]; sourceLevels: Record<string, AgentSourceLevel> };
  threadId: string;
  agentDef: AgentDefinition;
  prepared: ReturnType<typeof prepareWorkerTarget>;
  modelsPort: ModelsPort;
  agentsResolve: AgentsResolve;
  packRegistrations: PackRegistration[];
  lifecycle: InMemoryRunLifecycleStore;
  events: InMemoryRunEventStore;
  feed: RunEventFeed;
  instanceId: string;

  state?: InMemoryRuntimeState;
  plugin?: OrgPluginWiring;
  skills?: SkillRegistry;
  process?: ProcessJobTarget;
}

export async function createPlacedRunStack(input: PlacedRunStackInput): Promise<PlacedRunStack> {
  const { deps, prepared, plugin, skills } = input;
  const state = input.state ?? new InMemoryRuntimeState(input.threadId);
  const { fileRules } = deps;
  const targetRef = {
    agent: {
      id: input.agentId,
      sharedSourceIds: input.agentSources.sharedSourceIds,
      sourceLevels: input.agentSources.sourceLevels,
    },
    paths: { threadDir: prepared.paths.threadDir },
    runtime: {
      hostId: deps.machineConfig.get().id,
      primaryDirectory: prepared.paths.cwd,
    },
  };
  const faDeps =
    fileRules === undefined
      ? undefined
      : {
          orgId: input.orgId,
          fileRules,
          sources: deps.sources,
          sourceLocation: deps.sourceLocation,
        };
  const fileAccess = faDeps === undefined ? undefined : runTargetFileAccess(faDeps, targetRef);
  const fileAccessFor =
    faDeps === undefined
      ? undefined
      : (agent: AgentDefinition): FileAccessPolicy =>
          runTargetFileAccessForAgent({ ...faDeps, agents: deps.agents }, targetRef, agent.id);
  const engine = createRunEngine({
    lifecycle: input.lifecycle,
    events: input.events,
    feed: input.feed,
    instanceId: input.instanceId,
    models: input.modelsPort,
    toolRegistry: plugin !== undefined ? plugin.makeRegistry() : createToolRegistry([]),
    ...(skills !== undefined ? { skills } : {}),
    toolMessages: 'ordered',
    agents: input.agentsResolve,
    packRegistrations: input.packRegistrations,
    logger: CONSOLE_LOGGER,
  });
  const scope: CapabilityScope = {
    orgId: input.orgId,
    agentId: input.agentId,
    sourceIds: [],
    threadId: input.threadId,
    ...(input.agentName !== undefined ? { agentName: input.agentName } : {}),
  };
  const claimer = createPlacedClaimer({
    lifecycle: input.lifecycle,
    engine,
    instanceId: input.instanceId,
    state,
    agentDef: input.agentDef,
    permissions: prepared.permissions,
    paths: prepared.paths,
    cwd: prepared.paths.cwd,
    packRegistrations: input.packRegistrations,
    ...(skills !== undefined ? { skills } : {}),
    ...(plugin !== undefined ? { plugin } : {}),
    scope,
    ...(fileAccess !== undefined ? { fileAccess } : {}),
    ...(fileAccessFor !== undefined ? { fileAccessFor } : {}),
    ...(input.process !== undefined ? { process: input.process } : {}),
  });
  const createRt = deps.createRuntimeImpl ?? createRuntime;
  const runtime = await createRt({
    models: input.modelsPort,
    agents: input.agentsResolve,
    lifecycle: input.lifecycle,
    events: input.events,
    feed: input.feed,
    claimer,
    instanceId: input.instanceId,
    packs: input.packRegistrations,
    toolMessages: 'ordered',
    logger: CONSOLE_LOGGER,
  });
  return { claimer, engine, runtime, state };
}

function createPlacedClaimer(input: PlacedClaimerInput): RunClaimer {
  return createRunClaimer({
    lifecycle: input.lifecycle,
    engine: input.engine,
    instanceId: input.instanceId,
    withScope: (target, execute) =>
      runInHostToolScope((target.scope as CapabilityScope | undefined) ?? input.scope, execute),
    targets: {
      resolve: async () => ({
        state: input.state,
        agent: input.agentDef,
        permissions: input.permissions,
        paths: input.paths,
        packs: input.packRegistrations,
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
        ...(input.plugin !== undefined
          ? {
              hooks: input.plugin.view.hooksFor(input.agentDef, input.cwd),
              binDirs: input.plugin.view.binDirsFor(input.agentDef),
            }
          : {}),
        scope: input.scope,
        ...(input.fileAccess ? { fileAccess: input.fileAccess } : {}),
        ...(input.fileAccessFor ? { fileAccessFor: input.fileAccessFor } : {}),
        ...(input.process ? { process: input.process } : {}),
      }),
    },
  });
}
