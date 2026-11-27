import type { RunEnvironment, RunEnvironmentAnchor } from '@harnesys/contracts';
import type { AgentRecord } from '../agent/agent.ts';
import { HostFsLayoutPort } from '../machine/host-fs-layout.port.ts';
import { SourceLocationPort } from '../source/source-location.port.ts';
import { SourceRegistryPort } from '../source/source-registry.port.ts';
import { materializePrimary } from './run-environment.ts';
import type { GroupHistoryCoverage } from './thread-policy.ts';
import type { ActiveWorktreeRef, PrimaryKind, SharedSourceRef } from './thread-runtime-context.ts';

export interface GroupChannelMember {
  name: string;
  handle: string;
  isSelf: boolean;
}

export interface PrepareTargetOptions {
  environment?: RunEnvironment;
  mode?: string;
  groupHistory?: GroupHistoryCoverage;
  groupMembers?: GroupChannelMember[];
}

export interface RuntimePrimary {
  primaryDirectory: string;
  primaryKind: PrimaryKind;
  activeWorktree?: ActiveWorktreeRef;
  primarySourceId?: string;
}

export interface RuntimePrimaryDeps {
  orgId: string;
  threadId: string;
  layout: HostFsLayoutPort;
  localHostId: string;
  sourceLocation: SourceLocationPort;
}

export function isAnchoredEnvironment(
  environment?: RunEnvironment,
): environment is RunEnvironment & { anchor: RunEnvironmentAnchor } {
  return environment !== undefined && environment.cwd === 'anchor' && environment.anchor !== null;
}

export function resolveRuntimePrimary(
  deps: RuntimePrimaryDeps,
  options?: PrepareTargetOptions,
): RuntimePrimary {
  const threadDir = deps.layout.threadDir(deps.orgId, deps.threadId);
  const environment = options?.environment;
  if (!isAnchoredEnvironment(environment)) {
    return { primaryDirectory: threadDir, primaryKind: 'sandbox' };
  }
  const anchor = environment.anchor;
  if (anchor.kind === 'folder') {
    return materializePrimary(environment, {
      anchorRoot: anchor.path,
      threadDir,
    });
  }
  const location = deps.sourceLocation.resolve({
    orgId: deps.orgId,
    sourceId: anchor.sourceId,
    hostId: deps.localHostId,
    ...(anchor.worktreeId !== undefined ? { worktreeId: anchor.worktreeId } : {}),
  });
  const primary = materializePrimary(environment, {
    anchorRoot: location.absoluteRoot,
    threadDir,
  });
  if (anchor.worktreeId !== undefined) {
    return {
      ...primary,
      primaryKind: 'worktree',
      activeWorktree: {
        worktreeId: anchor.worktreeId,
        sourceId: anchor.sourceId,
        hostId: deps.localHostId,
        root: location.absoluteRoot,
      },
    };
  }
  return {
    ...primary,
    primaryKind: 'source',
    primarySourceId: anchor.sourceId,
  };
}

export interface SharedSourcesDeps {
  orgId: string;
  sources: SourceRegistryPort;
}

export function sharedSourcesOf(deps: SharedSourcesDeps, agent: AgentRecord): SharedSourceRef[] {
  const out: SharedSourceRef[] = [];
  for (const id of agent.sharedSourceIds) {
    const record = deps.sources.findById(deps.orgId, id);
    out.push({ id, name: record?.name ?? id, description: record?.description ?? null });
  }
  return out;
}
