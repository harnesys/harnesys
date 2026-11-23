import { dirname, isAbsolute } from 'node:path';
import type { RunEnvironment, WorkspaceRef } from '@harnesys/contracts';
import { resolveEnvironment, type WorkspaceLayer } from '@harnesys/studio-shared';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { WorktreeNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { assertFolderAllowed, assertRelativeSubpath } from '../../domain/thread/run-environment.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface ResolveRunEnvironmentDeps {
  orgId: string;
  threads: ThreadRepositoryPort;
  agents: AgentRegistryPort;
  sources: SourceRegistryPort;
  worktrees: RepositoryWorktreePort;
  layout: HostFsLayoutPort;
  localHostId: string;
}

export interface ResolveRunEnvironmentInput {
  threadId: string;
  agentId: string;
  explicit?: WorkspaceRef;
  issue: boolean;
  branch?: string;
}

export function resolveRunEnvironment(
  deps: ResolveRunEnvironmentDeps,
  input: ResolveRunEnvironmentInput,
): RunEnvironment {
  const thread = deps.threads.findById(deps.orgId, input.threadId);
  if (!thread) {
    throw new ThreadNotFoundException(input.threadId);
  }
  const agent = deps.agents.findById(deps.orgId, input.agentId);
  if (!agent) {
    throw new ThreadValidationException(`agent not found for thread: ${input.agentId}`);
  }
  const layers: WorkspaceLayer[] = [
    { origin: 'run', ref: input.explicit ?? null },
    { origin: 'thread', ref: thread.workspaceRef },
    { origin: 'agent', ref: agent.defaultWorkspaceRef ?? null },
  ];
  const environment = resolveEnvironment({
    layers,
    issue: input.issue,
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
  });
  assertAnchor(deps, environment);
  return environment;
}

export function workspaceProtectedRoots(layout: HostFsLayoutPort, orgId: string): string[] {
  return [dirname(layout.orgDataDir(orgId)), dirname(layout.orgDir(orgId))];
}

function assertAnchor(deps: ResolveRunEnvironmentDeps, environment: RunEnvironment): void {
  const anchor = environment.anchor;
  if (anchor === null) {
    return;
  }
  const subpath = environment.subpath;
  if (subpath !== undefined) {
    assertRelativeSubpath(subpath);
  }
  if (anchor.kind === 'folder') {
    assertFolderAnchor(deps, anchor);
    return;
  }
  assertSourceAnchor(deps, anchor);
}

function assertFolderAnchor(
  deps: ResolveRunEnvironmentDeps,
  anchor: { kind: 'folder'; path: string; hostId?: string },
): void {
  if (!isAbsolute(anchor.path)) {
    throw new ThreadValidationException(`workspace folder must be absolute: ${anchor.path}`);
  }
  assertFolderAllowed(workspaceProtectedRoots(deps.layout, deps.orgId), anchor.path);
}

function assertSourceAnchor(
  deps: ResolveRunEnvironmentDeps,
  anchor: { kind: 'source'; sourceId: string; worktreeId?: string },
): void {
  if (!deps.sources.findById(deps.orgId, anchor.sourceId)) {
    throw new ThreadValidationException(`workspace source not found: ${anchor.sourceId}`);
  }
  assertWorktree(deps, anchor);
}

function assertWorktree(
  deps: ResolveRunEnvironmentDeps,
  anchor: { sourceId: string; worktreeId?: string },
) {
  if (anchor.worktreeId === undefined) {
    return null;
  }
  const row = deps.worktrees.findById(deps.orgId, anchor.worktreeId);
  if (!row || row.sourceId !== anchor.sourceId) {
    throw new WorktreeNotFoundException(anchor.worktreeId);
  }
  if (row.state !== 'ready') {
    throw new ThreadValidationException(`worktree ${anchor.worktreeId} is not ready`);
  }
  return row;
}
