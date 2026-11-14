import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type AgentMode, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type {
  AgentDefinition,
  CapabilityScope,
  ModeCapabilityFields,
  PackAssignment,
  PermissionMap,
  RunTarget,
} from 'harnesys';
import { intersectPermissions } from 'harnesys';
import { runModeOf } from '../../application/threads/thread.helpers.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { CHANNEL_NOTE } from '../../domain/connector/constants.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import {
  mergeShellAssignment,
  rawShellAssignment,
  shellSpecBaseOf,
} from '../../domain/mode-presets/preset-shell-merge.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import {
  type PrepareTargetOptions,
  type RunTriggerKind,
  resolveRuntimePrimary,
  sharedSourcesOf,
} from '../../domain/thread/prepare-runtime-input.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { historyLastOf, historyModeOf } from '../../domain/thread/thread-policy.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  type PrimarySourceRef,
  threadRuntimeContextOf,
} from '../../domain/thread/thread-runtime-context.ts';
import {
  type AgentModelLookup,
  modeByIdOf,
  modesFromConfig,
  permissionsFromConfig,
  toAgentDefinition,
} from './agent-definition.mapper.ts';
import { groupChannelNote } from './group-note.ts';
import { type TargetCache, targetCacheKey } from './target-cache.ts';

export interface PrepareOrgTargetDeps {
  orgId: string;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  threads: ThreadRepositoryPort;
  agents: AgentRegistryPort;
  modes: ModePresetRegistryPort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
}

export type { TargetCache } from './target-cache.ts';
export { cachedTargetOf, targetCacheKey } from './target-cache.ts';

export interface PreparedPaths {
  allow: string[];
  write: string[];
  cwd: string;
  threadDir: string;
}

export type { PrepareTargetOptions };

export function runtimeOptionsOf(
  binding:
    | { directory?: string; sourceId?: string; worktreeId?: string; triggerKind?: RunTriggerKind }
    | undefined,
): PrepareTargetOptions {
  return {
    ...(binding?.directory !== undefined ? { directory: binding.directory } : {}),
    ...(binding?.sourceId !== undefined ? { sourceId: binding.sourceId } : {}),
    ...(binding?.worktreeId !== undefined ? { worktreeId: binding.worktreeId } : {}),
    ...(binding?.triggerKind !== undefined ? { triggerKind: binding.triggerKind } : {}),
  };
}

export function definitionOf(deps: PrepareOrgTargetDeps, agent: AgentRecord) {
  const model = deps.models.findById(deps.orgId, agent.modelId);
  const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
  return toAgentDefinition(agent, { model, provider });
}

export function scopeOf(orgId: string, target: RunTarget): CapabilityScope {
  const fromTarget = target.scope;
  if (fromTarget && typeof fromTarget === 'object') {
    return fromTarget as CapabilityScope;
  }
  return {
    orgId,
    agentId: target.agent.id,
    sourceIds: [],
    threadId: target.state.sessionId,
  };
}

export function prepareTarget(
  deps: PrepareOrgTargetDeps,
  threadId: string,
  agentId: string,
  cache: TargetCache,
  options?: PrepareTargetOptions,
) {
  const thread = deps.threads.findById(deps.orgId, threadId);
  if (!thread) {
    return null;
  }
  const agent = deps.agents.findById(deps.orgId, agentId);
  if (!agent) {
    throw new ThreadValidationException('agent not found for thread');
  }
  if (!agent.modelId) {
    throw new ThreadValidationException('agent has no model');
  }
  const model = deps.models.findById(deps.orgId, agent.modelId);
  if (!model) {
    throw new ThreadValidationException('model not found');
  }
  const provider = deps.providers.findById(deps.orgId, model.providerId);
  if (!provider) {
    throw new ThreadValidationException('provider not found');
  }

  const hostId = deps.machineConfig.get().id;
  const primary = resolveRuntimePrimary(
    {
      orgId: deps.orgId,
      threadId,
      layout: deps.layout,
      localHostId: hostId,
      sourceLocation: deps.sourceLocation,
    },
    options,
  );
  if (primary.primaryKind === 'directory' && !isDirectory(primary.primaryDirectory)) {
    throw new ThreadValidationException(
      `run directory not found on host ${hostId}: ${primary.primaryDirectory}`,
    );
  }
  mkdirSync(primary.threadSandbox, { recursive: true, mode: 0o700 });
  const threadDir = deps.layout.threadDir(deps.orgId, threadId);
  const attachmentsDir = join(threadDir, 'attachments');
  const paths: PreparedPaths = {
    allow: [attachmentsDir, primary.primaryDirectory],
    write: [primary.primaryDirectory],
    cwd: primary.primaryDirectory,
    threadDir,
  };
  cache.set(targetCacheKey(threadId, agent.id), {
    agentId: agent.id,
    pathsAllow: paths.allow,
    cwd: paths.cwd,
  });
  const scope: CapabilityScope = {
    orgId: deps.orgId,
    agentId: agent.id,
    sourceIds: agent.sharedSourceIds,
    threadId,
    ...(agent.name ? { agentName: agent.name } : {}),
  };
  const primarySource =
    primary.primarySourceId !== undefined
      ? primarySourceRefOf(deps, primary.primarySourceId, primary.primaryDirectory)
      : undefined;
  const runtime = threadRuntimeContextOf({
    hostId,
    runtime: 'host',
    threadSandbox: primary.threadSandbox,
    primary: { directory: primary.primaryDirectory, kind: primary.primaryKind },
    ...(primary.activeWorktree !== undefined ? { worktree: primary.activeWorktree } : {}),
    ...(primarySource !== undefined ? { primarySource } : {}),
    sharedSources: sharedSourcesOf({ orgId: deps.orgId, sources: deps.sources }, agent),
  });
  const notes: string[] = [];
  if (thread.kind === 'group') {
    notes.push(
      groupChannelNote({
        mode: historyModeOf(thread.policy, thread.kind),
        historyLast: historyLastOf(thread.policy),
        total: thread.conversationCount,
      }),
    );
  }
  if (thread.metadata.provider === 'telegram') {
    notes.push(CHANNEL_NOTE);
  }
  const channelNote = notes.length > 0 ? notes.join('\n\n') : undefined;
  const modeId = options?.mode ?? runModeOf(thread);
  return {
    agent,
    agentDef: runAgentDef(deps, agent, modeId, { model, provider }),
    mode: runModeCapability(deps, agent, modeId),
    permissions: runPermissions(deps, agent, modeId),
    paths,
    threadDir,
    scope,
    runtime,
    channelNote,
  };
}

function primarySourceRefOf(
  deps: PrepareOrgTargetDeps,
  sourceId: string,
  root: string,
): PrimarySourceRef & { root: string } {
  const record = deps.sources.findById(deps.orgId, sourceId);
  return {
    sourceId,
    root,
    name: record?.name ?? sourceId,
    kind: record?.vcs != null ? 'git' : 'folder',
  };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function runAgentDef(
  deps: PrepareOrgTargetDeps,
  agent: AgentRecord,
  modeId: string | undefined,
  lookup: AgentModelLookup,
): AgentDefinition {
  const agentDef = toAgentDefinition(agent, lookup);
  const preset = presetOf(deps, modeId);
  if (preset) {
    mergePresetShell(agentDef, agent.config, preset);
  }
  return agentDef;
}

function presetOf(
  deps: PrepareOrgTargetDeps,
  modeId: string | undefined,
): ModePresetRecord | undefined {
  if (!modeId) {
    return undefined;
  }
  return deps.modes.findById(deps.orgId, modeId);
}

function runModeCapability(
  deps: PrepareOrgTargetDeps,
  agent: AgentRecord,
  modeId: string | undefined,
): ModeCapabilityFields | undefined {
  const effective = modeId ?? agent.defaultModeId ?? undefined;
  if (effective === undefined || effective === DEFAULT_MODE_ID) {
    return undefined;
  }
  const local = modeByIdOf(modesFromConfig(agent.config), effective);
  if (local !== undefined) {
    return capabilityFieldsOf(local);
  }
  const preset = deps.modes.findById(deps.orgId, effective);
  if (preset === undefined) {
    return undefined;
  }
  return capabilityFieldsOf({
    id: preset.id,
    name: preset.name,
    packs: preset.packs,
    disabledTools: preset.disabledTools,
    exposure: preset.exposure,
  });
}

function capabilityFieldsOf(mode: AgentMode): ModeCapabilityFields {
  const packs: Record<string, PackAssignment> = {};
  for (const [name, assignment] of Object.entries(mode.packs ?? {})) {
    if (assignment !== null && assignment !== false) {
      packs[name] = assignment;
    }
  }
  return {
    id: mode.id,
    packs,
    ...(mode.disabledTools?.length ? { disabledTools: mode.disabledTools } : {}),
    ...(mode.exposure !== undefined && Object.keys(mode.exposure).length > 0
      ? { exposure: mode.exposure }
      : {}),
  };
}

function runPermissions(
  deps: PrepareOrgTargetDeps,
  agent: AgentRecord,
  modeId: string | undefined,
): PermissionMap {
  const agentPermissions = permissionsFromConfig(agent.config) ?? {};
  const preset = presetOf(deps, modeId);
  if (!preset) {
    return agentPermissions;
  }
  return intersectPermissions(agentPermissions, modePermissionsOf(preset));
}

function modePermissionsOf(preset: ModePresetRecord): PermissionMap {
  const permissions: PermissionMap = {};
  for (const [op, gate] of Object.entries(preset.permissions)) {
    if (gate !== undefined) {
      permissions[op] = gate;
    }
  }
  return permissions;
}

function mergePresetShell(
  agentDef: AgentDefinition,
  config: Record<string, unknown>,
  preset: ModePresetRecord,
): void {
  const presetShell = preset.packs.shell;
  if (presetShell === undefined || presetShell === null || presetShell === false) {
    return;
  }
  const rawAgent = rawShellAssignment(config);
  if (rawAgent === false) {
    return;
  }
  const assignments = agentDef.packs;
  if (!assignments) {
    return;
  }
  (assignments as Record<string, unknown>).shell = mergeShellAssignment(
    rawAgent,
    shellSpecBaseOf(presetShell),
  );
}
