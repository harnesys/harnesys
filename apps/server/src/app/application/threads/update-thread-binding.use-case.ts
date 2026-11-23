import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { ThreadSummary, UpdateThreadBindingBody, WorkspaceRef } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { WorktreeNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { assertFolderAllowed } from '../../domain/thread/run-environment.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { workspaceProtectedRoots } from './resolve-run-environment.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface UpdateThreadBindingRequest {
  orgId: string;
  threadId: string;
  body: UpdateThreadBindingBody;
}

@Injectable()
export class UpdateThreadBindingUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  execute(request: UpdateThreadBindingRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (request.body.runProfileId) {
      this.assertProfile(request.orgId, request.body.runProfileId);
    }
    if (request.body.runDirectory && request.body.workspaceRef) {
      throw new ThreadValidationException('runDirectory and workspaceRef are mutually exclusive');
    }
    if (request.body.runDirectory) {
      assertAbsoluteDirectory(request.body.runDirectory);
    }
    const workspaceRef =
      request.body.workspaceRef !== undefined
        ? this.resolveWorkspaceRef(request.orgId, request.body.workspaceRef)
        : undefined;
    const locked = this.threads.threadHasRuns(request.orgId, thread.id);
    if (locked && bindingChanged(request, thread, workspaceRef)) {
      throw new ThreadValidationException('thread binding is locked after the first run');
    }
    const updated = this.threads.patch(request.orgId, thread.id, {
      ...(request.body.runProfileId !== undefined
        ? { runProfileId: request.body.runProfileId }
        : {}),
      ...(request.body.runDirectory !== undefined
        ? { runDirectory: request.body.runDirectory }
        : {}),
      ...(workspaceRef !== undefined ? { workspaceRef } : {}),
    });
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread: updated,
      members: membersOf(deps, request.orgId, updated.id),
      participants: participantsOf(deps, request.orgId, updated.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: locked,
    });
  }

  private assertProfile(orgId: string, profileId: string): void {
    if (!this.profiles.findById(orgId, profileId)) {
      throw new ThreadValidationException(`execution profile not found: ${profileId}`);
    }
  }

  private resolveWorkspaceRef(orgId: string, ref: WorkspaceRef | null): WorkspaceRef | null {
    if (ref === null || ref.kind === 'inherit' || ref.kind === 'sandbox') {
      return ref;
    }
    if (ref.kind === 'folder') {
      return this.folderRef(orgId, ref);
    }
    this.assertSource(orgId, ref.sourceId);
    if (ref.kind === 'source') {
      return ref;
    }
    const row = this.worktrees.findById(orgId, ref.worktreeId);
    if (!row || row.sourceId !== ref.sourceId) {
      throw new WorktreeNotFoundException(ref.worktreeId);
    }
    if (row.state !== 'ready') {
      throw new ThreadValidationException(`worktree ${ref.worktreeId} is not ready`);
    }
    return ref;
  }

  private folderRef(orgId: string, ref: Extract<WorkspaceRef, { kind: 'folder' }>): WorkspaceRef {
    if (!isAbsolute(ref.path)) {
      throw new ThreadValidationException(`workspace folder must be absolute: ${ref.path}`);
    }
    assertFolderAllowed(workspaceProtectedRoots(this.layout, orgId), ref.path);
    const localHostId = this.machineConfig.get().id;
    if (ref.hostId !== undefined && ref.hostId !== localHostId) {
      return ref;
    }
    if (!isDirectory(ref.path)) {
      throw new ThreadValidationException(
        `workspace folder not found on host ${localHostId}: ${ref.path}`,
      );
    }
    return { ...ref, hostId: ref.hostId ?? localHostId };
  }

  private assertSource(orgId: string, sourceId: string): void {
    if (!this.sources.findById(orgId, sourceId)) {
      throw new ThreadValidationException(`workspace source not found: ${sourceId}`);
    }
  }
}

function bindingChanged(
  request: UpdateThreadBindingRequest,
  thread: {
    runProfileId: string | null;
    runDirectory: string | null;
    workspaceRef: WorkspaceRef | null;
  },
  workspaceRef: WorkspaceRef | null | undefined,
): boolean {
  if (
    request.body.runProfileId !== undefined &&
    request.body.runProfileId !== thread.runProfileId
  ) {
    return true;
  }
  if (
    request.body.runDirectory !== undefined &&
    request.body.runDirectory !== thread.runDirectory
  ) {
    return true;
  }
  return workspaceRef !== undefined && !workspaceRefEquals(workspaceRef, thread.workspaceRef);
}

function workspaceRefEquals(left: WorkspaceRef | null, right: WorkspaceRef | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function assertAbsoluteDirectory(directory: string): void {
  if (!isAbsolute(directory)) {
    throw new ThreadValidationException(`runDirectory must be an absolute path: ${directory}`);
  }
}
