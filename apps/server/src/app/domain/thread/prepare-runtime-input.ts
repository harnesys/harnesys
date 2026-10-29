import { join } from 'node:path';
import type { AgentRecord } from '../agent/agent.ts';
import type { HostFsLayoutPort } from '../machine/host-fs-layout.port.ts';
import type { SourceLocationPort } from '../source/source-location.port.ts';
import type { SourceRegistryPort } from '../source/source-registry.port.ts';
import type { ActiveWorktreeRef, PrimaryKind, SharedSourceRef } from './thread-runtime-context.ts';

export type RunTriggerKind = 'chat' | 'issue' | 'schedule' | 'webhook' | 'connector';

export interface PrepareTargetOptions {
  worktreeId?: string;
  sourceId?: string;
  directory?: string;
  triggerKind?: RunTriggerKind;
}

export interface RuntimePrimary {
  primaryDirectory: string;
  primaryKind: PrimaryKind;
  threadSandbox: string;
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

export function resolveRuntimePrimary(
  deps: RuntimePrimaryDeps,
  options?: PrepareTargetOptions,
): RuntimePrimary {
  const threadSandbox = join(deps.layout.threadDir(deps.orgId, deps.threadId), 'sandbox');
  if (options?.directory !== undefined) {
    return {
      primaryDirectory: options.directory,
      primaryKind: 'directory',
      threadSandbox,
    };
  }
  const worktree = options?.worktreeId;
  if (worktree !== undefined && options?.sourceId !== undefined) {
    const sourceId = options.sourceId;
    const location = deps.sourceLocation.resolve({
      orgId: deps.orgId,
      sourceId,
      hostId: deps.localHostId,
      worktreeId: worktree,
    });
    return {
      primaryDirectory: location.absoluteRoot,
      primaryKind: 'worktree',
      threadSandbox,
      activeWorktree: {
        worktreeId: worktree,
        sourceId,
        hostId: deps.localHostId,
        root: location.absoluteRoot,
      },
    };
  }
  if (
    options?.triggerKind === 'issue' &&
    options.sourceId !== undefined &&
    worktree === undefined
  ) {
    const sourceId = options.sourceId;
    const location = deps.sourceLocation.resolve({
      orgId: deps.orgId,
      sourceId,
      hostId: deps.localHostId,
    });
    return {
      primaryDirectory: location.absoluteRoot,
      primaryKind: 'source',
      threadSandbox,
      primarySourceId: sourceId,
    };
  }
  return { primaryDirectory: threadSandbox, primaryKind: 'sandbox', threadSandbox };
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
