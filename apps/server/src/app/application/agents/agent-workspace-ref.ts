import { isAbsolute } from 'node:path';
import type { WorkspaceRef } from '@harnesys/contracts';
import { AgentValidationException } from '../../domain/agent/agent.error.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { assertFolderAllowed, assertRelativeSubpath } from '../../domain/thread/run-environment.ts';
import { workspaceProtectedRoots } from '../threads/resolve-run-environment.ts';

export interface AgentWorkspaceRefDeps {
  orgId: string;
  sources: SourceRegistryPort;
  layout: HostFsLayoutPort;
  localHostId: string;
}

export function validateAgentWorkspaceRef(
  deps: AgentWorkspaceRefDeps,
  ref: WorkspaceRef | null,
): WorkspaceRef | null {
  if (ref === null || ref.kind === 'thread') {
    return ref;
  }
  if (ref.kind === 'inherit') {
    throw new AgentValidationException('agent default workspace cannot inherit a parent layer');
  }
  if (ref.kind === 'worktree') {
    throw new AgentValidationException('agent default workspace cannot be a worktree');
  }
  if (ref.kind === 'source') {
    if (!deps.sources.findById(deps.orgId, ref.sourceId)) {
      throw new AgentValidationException(`workspace source not found: ${ref.sourceId}`);
    }
    if (ref.subpath !== undefined) {
      assertRelativeSubpath(ref.subpath);
    }
    return ref;
  }
  if (!isAbsolute(ref.path)) {
    throw new AgentValidationException(`workspace folder must be absolute: ${ref.path}`);
  }
  assertFolderAllowed(workspaceProtectedRoots(deps.layout, deps.orgId), ref.path);
  return ref.hostId === undefined ? { ...ref, hostId: deps.localHostId } : ref;
}
