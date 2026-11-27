import type { RunEnvironment } from '@harnesys/contracts';
import type {
  RuntimePromptInfo,
  RuntimePromptPrimarySource,
  RuntimePromptSource,
  RuntimePromptWorktree,
} from 'harnesys';
import {
  type SourceIndexState,
  sourceIndexStateOf,
} from '../../domain/knowledge/index-state-summary.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import type { PrimarySourceRef } from '../../domain/thread/thread-runtime-context.ts';

interface PreparedPromptTarget {
  agent: { id: string; sharedSourceIds: string[] };
  runtime: {
    hostId: string;
    primaryDirectory: string;
    primaryKind: 'thread' | 'directory' | 'worktree' | 'source';
    threadDir: string;
    activeWorktree?: { worktreeId: string; sourceId: string; root: string };
    primarySource?: PrimarySourceRef;
  };
}

export interface RuntimePromptDeps {
  orgId: string;
  machineConfig: MachineConfigPort;
  sources: SourceRegistryPort;
  materializations: SourceMaterializationPort;
  knowledge?: { store: KnowledgeStorePort };
  worktrees?: RepositoryWorktreePort;
}

export function runRuntimePromptInfo(
  deps: RuntimePromptDeps,
  prepared: PreparedPromptTarget,
  environment?: RunEnvironment,
): RuntimePromptInfo {
  const worktree = worktreeOf(deps, prepared);
  const primarySource = primarySourceOf(deps, prepared, environment);
  return {
    hostName: deps.machineConfig.get().name,
    environment: isContainerEnvironment(environment) ? 'container' : 'host',
    primaryDirectory: prepared.runtime.primaryDirectory,
    primaryKind: prepared.runtime.primaryKind,
    threadDir: prepared.runtime.threadDir,
    sharedSources: promptSourcesOf(deps, prepared),
    ...(worktree ? { worktree } : {}),
    ...(primarySource ? { primarySource } : {}),
  };
}

export function isContainerEnvironment(environment?: RunEnvironment): boolean {
  return environment?.isolation?.mode === 'container';
}

function primarySourceOf(
  deps: RuntimePromptDeps,
  prepared: PreparedPromptTarget,
  environment: RunEnvironment | undefined,
): RuntimePromptPrimarySource | undefined {
  const ref = prepared.runtime.primarySource;
  if (prepared.runtime.primaryKind !== 'source' || !ref) {
    return undefined;
  }
  const record = deps.sources.findById(deps.orgId, ref.sourceId);
  const branch = environment?.branch?.trim();
  return {
    name: record?.name ?? ref.name,
    kind: ref.kind,
    ...(ref.kind === 'git' && branch ? { branch } : {}),
  };
}

function promptSourcesOf(
  deps: RuntimePromptDeps,
  prepared: PreparedPromptTarget,
): RuntimePromptSource[] {
  const out: RuntimePromptSource[] = [];
  for (const sourceId of prepared.agent.sharedSourceIds) {
    const materialization = deps.materializations.find(
      deps.orgId,
      sourceId,
      prepared.runtime.hostId,
    );
    if (materialization?.state !== 'ready' || !materialization.localPath) {
      continue;
    }
    const record = deps.sources.findById(deps.orgId, sourceId);
    out.push({
      name: record?.name ?? sourceId,
      path: materialization.localPath,
      description: record?.description ?? null,
      indexState: indexStateOf(deps, sourceId),
    });
  }
  return out;
}

function indexStateOf(deps: RuntimePromptDeps, sourceId: string): SourceIndexState {
  const store = deps.knowledge?.store;
  if (!store) {
    return 'not-indexed';
  }
  const files = store.countFilesByStatus(deps.orgId, sourceId);
  const settings = store.getSettings(deps.orgId, sourceId);
  const index = store.getIndexState(deps.orgId, sourceId);
  return sourceIndexStateOf({
    entireSource: settings.entireSource,
    indexed: files.indexed,
    pending: files.pending,
    total: index.total,
    running: index.status === 'running',
  });
}

function worktreeOf(
  deps: RuntimePromptDeps,
  prepared: PreparedPromptTarget,
): RuntimePromptWorktree | undefined {
  const ref = prepared.runtime.activeWorktree;
  if (!ref) {
    return undefined;
  }
  const source = deps.sources.findById(deps.orgId, ref.sourceId);
  const worktree = deps.worktrees?.findById(deps.orgId, ref.worktreeId);
  return {
    repository: source?.vcs?.remoteUrl ?? source?.name ?? ref.sourceId,
    branch: worktree?.branch ?? source?.vcs?.defaultBranch ?? '',
    path: ref.root,
  };
}
