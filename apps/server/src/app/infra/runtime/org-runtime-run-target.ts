import {
  type AgentDefinition,
  type CapabilityUniverse,
  createLoadToolsTool,
  createRunEventFeed,
  createThreadsHistoryTool,
  type InMemoryRuntimeState,
  type PackRegistration,
  type RunEventStore,
  type RunLifecycleStore,
  type RunRegistry,
  resolveCapabilitySet,
  THREADS_HISTORY_TOOL,
  type ToolDefinition,
} from 'harnesys';
import { composeRunSkills } from './compose-run-skills.ts';
import { runInHostToolScope } from './host-tool-scope.ts';
import type { OrgPluginWiring } from './org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import { createAgentsResolve } from './org-runtime-agents.ts';
import { runTargetFileAccess, runTargetFileAccessForAgent } from './org-runtime-file-access.ts';
import { resolveTargetHooks, targetHookReport } from './org-runtime-hooks.ts';
import {
  applyShellRulePatterns,
  runTargetPermissionGrants,
} from './org-runtime-permission-rules.ts';
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
  lifecycle: RunLifecycleStore;
  feed: ReturnType<typeof createRunEventFeed>;
  steering: SteeringChannel;
}

export interface RunTargetSelector {
  runId?: string;
  agentId?: string;
}

export function createRunTargetResolver(ctx: RunTargetResolverContext) {
  return async function resolveRunTarget(
    threadId: string,
    state: InMemoryRuntimeState,
    selector?: RunTargetSelector,
  ) {
    const { deps, plugin } = ctx;
    const binding = ctx.worktreeBindings.get(threadId);
    const agentId = await resolveAgentId(ctx, selector);
    if (agentId === undefined) {
      return null;
    }
    const prepared = prepareTarget(
      deps,
      threadId,
      agentId,
      ctx.targetCache,
      runtimeOptionsOf(binding),
    );
    if (!prepared) {
      return null;
    }
    const agentDef = agentDefFor(ctx, threadId, prepared.agentDef);
    const skills = await composeRunSkills({
      orgSkills: plugin.skills,
      discovery: deps.sourceSkills,
      sources: resolveRunSourceRefs(deps, prepared.scope.sourceIds),
      autoLoad: deps.orgSettings.get(deps.orgId).skillsSourceAutoLoad,
    });
    const universe: CapabilityUniverse = {
      registrations: ctx.packRegistrations,
      baseRegistry: withThreadHistory(plugin.makeRegistry(), {
        threadId,
        events: ctx.events,
      }),
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
      discoverTool: makeDiscoverTool(ctx, agentDef),
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
      ...(deps.permissionRules !== undefined
        ? { permissionGrants: runTargetPermissionGrants(deps.permissionRules, deps.orgId) }
        : {}),
      runtime: runRuntimePromptInfo(deps, prepared, binding),
      steerMessages: () => ctx.steering.steer(threadId),
      ackSteerMessages: (itemIds: string[]) => ctx.steering.ack(itemIds),
      ...(process ? { process } : {}),
      ...(prepared.channelNote ? { channelNote: prepared.channelNote } : {}),
    };
    return target;
  };
}

async function resolveAgentId(
  ctx: RunTargetResolverContext,
  selector: RunTargetSelector | undefined,
): Promise<string | undefined> {
  if (selector?.agentId !== undefined) {
    return selector.agentId;
  }
  if (selector?.runId === undefined) {
    return undefined;
  }
  const run = await ctx.lifecycle.get(selector.runId);
  return run?.agentId;
}

function withThreadHistory(
  base: Map<string, ToolDefinition>,
  deps: { threadId: string; events: RunEventStore },
): Map<string, ToolDefinition> {
  const registry = new Map(base);
  registry.set(THREADS_HISTORY_TOOL, createThreadsHistoryTool(deps));
  return registry;
}

function agentDefFor(
  ctx: RunTargetResolverContext,
  threadId: string,
  agentDef: AgentDefinition,
): AgentDefinition {
  const requested = ctx.sessionRequested.get(threadId) ?? [];
  const withSkills =
    requested.length > 0
      ? {
          ...agentDef,
          skills: [...new Set([...(agentDef.skills ?? []), ...requested])],
        }
      : agentDef;
  const shellPatterns = ctx.deps.permissionRules?.shellPatterns(ctx.deps.orgId, withSkills.id);
  return shellPatterns === undefined
    ? withSkills
    : applyShellRulePatterns(withSkills, shellPatterns);
}

function makeDiscoverTool(ctx: RunTargetResolverContext, agentDef: AgentDefinition) {
  return (name: string): ToolDefinition | undefined => {
    const def = ctx.plugin.makeRegistry().get(name);
    if (def === undefined) {
      return undefined;
    }
    const server = def.operations?.includes('mcp') === true ? def.group : undefined;
    if (server === undefined) {
      return def;
    }
    const fresh = ctx.deps.agents.findById(ctx.deps.orgId, agentDef.id);
    return new Set(fresh?.mcpServers ?? agentDef.mcpServers ?? []).has(server) ? def : undefined;
  };
}
