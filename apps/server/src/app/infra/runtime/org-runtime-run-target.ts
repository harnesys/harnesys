import {
  type AgentDefinition,
  type CapabilityUniverse,
  createLoadToolsTool,
  createRunEventFeed,
  type InMemoryRuntimeState,
  type PackRegistration,
  type RunEventStore,
  type RunRegistry,
  resolveCapabilitySet,
  type ToolDefinition,
} from 'harnesys';
import { composeRunSkills } from './compose-run-skills.ts';
import { runInHostToolScope } from './host-tool-scope.ts';
import type { OrgPluginWiring } from './org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import { createAgentsResolve } from './org-runtime-agents.ts';
import { runTargetFileAccess, runTargetFileAccessForAgent } from './org-runtime-file-access.ts';
import { resolveTargetHooks, targetHookReport } from './org-runtime-hooks.ts';
import { type SteeringChannel } from './org-runtime-queue.ts';
import { resolveRunSourceRefs } from './org-runtime-source-refs.ts';
import { prepareTarget, runtimeOptionsOf, type TargetCache } from './prepare-org-target.ts';
import { runRuntimePromptInfo } from './runtime-prompt.ts';
import {
  preparedWorkspacePathsOf,
  resolveProcessTarget,
  type ThreadBinding,
} from './workspace-target.ts';

export interface RunTargetResolverContext {
  deps: OrgRuntimeDeps;
  plugin: OrgPluginWiring;
  agentsResolve: ReturnType<typeof createAgentsResolve>;
  packRegistrations: PackRegistration[];
  worktreeBindings: Map<string, ThreadBinding>;
  targetCache: TargetCache;
  sessionRequested: Map<string, string[]>;
  events: RunEventStore;
  feed: ReturnType<typeof createRunEventFeed>;
  steering: SteeringChannel;
}

export function createRunTargetResolver(ctx: RunTargetResolverContext) {
  return async function resolveRunTarget(threadId: string, state: InMemoryRuntimeState) {
    const { deps, plugin } = ctx;
    const binding = ctx.worktreeBindings.get(threadId);
    const prepared = prepareTarget(deps, threadId, ctx.targetCache, runtimeOptionsOf(binding));
    if (!prepared) {
      return null;
    }
    const requested = ctx.sessionRequested.get(threadId) ?? [];
    const agentDef: AgentDefinition =
      requested.length > 0
        ? {
            ...prepared.agentDef,
            skills: [...new Set([...(prepared.agentDef.skills ?? []), ...requested])],
          }
        : prepared.agentDef;
    const skills = await composeRunSkills({
      orgSkills: plugin.skills,
      discovery: deps.sourceSkills,
      sources: resolveRunSourceRefs(deps, prepared.scope.sourceIds),
      autoLoad: deps.orgSettings.get(deps.orgId).skillsSourceAutoLoad,
    });
    const universe: CapabilityUniverse = {
      registrations: ctx.packRegistrations,
      baseRegistry: plugin.makeRegistry(),
      roster: ctx.agentsResolve.list(agentDef),
      fsSkills: skills,
      mode: prepared.mode,
      makeLoadSkill: () => plugin.makeLoadSkill(skills),
      makeLoadTools: (registry: RunRegistry) =>
        createLoadToolsTool(
          new Map(
            [...registry].map(([name, entry]) => [
              name,
              { ...entry.def, exposure: entry.exposure } as ToolDefinition,
            ]),
          ),
        ),
      discoverTool: (name: string) => {
        const def = plugin.makeRegistry().get(name);
        if (def === undefined) {
          return undefined;
        }
        const server = def.operations?.includes('mcp') === true ? def.group : undefined;
        if (server !== undefined) {
          const fresh = deps.agents.findById(deps.orgId, agentDef.id);
          if (!new Set(fresh?.mcpServers ?? agentDef.mcpServers ?? []).has(server)) {
            return undefined;
          }
        }
        return def;
      },
    };
    const capabilitySet = runInHostToolScope(prepared.scope, () =>
      resolveCapabilitySet(agentDef, universe),
    );
    const process = await resolveProcessTarget(deps, binding, preparedWorkspacePathsOf(prepared));
    const target = {
      state,
      agent: agentDef,
      permissions: prepared.permissions,
      paths: prepared.paths,
      packs: ctx.packRegistrations,
      capabilitySet,
      universe,
      skills,
      hooks: await resolveTargetHooks({ deps, plugin, agentDef, cwd: prepared.paths.cwd }),
      ...targetHookReport({ deps, events: ctx.events, feed: ctx.feed }),
      binDirs: plugin.view.binDirsFor(agentDef),
      scope: prepared.scope,
      fileAccess: runTargetFileAccess(deps, prepared),
      fileAccessFor: (agent: AgentDefinition) =>
        runTargetFileAccessForAgent(deps, prepared, agent.id),
      runtime: runRuntimePromptInfo(deps, prepared, binding),
      steerMessages: () => ctx.steering.steer(threadId),
      ackSteerMessages: (itemIds: string[]) => ctx.steering.ack(itemIds),
      ...(process ? { process } : {}),
      ...(prepared.channelNote ? { channelNote: prepared.channelNote } : {}),
    };
    return target;
  };
}
