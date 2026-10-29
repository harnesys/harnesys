import type { MaterializationOrigin } from '@harnesys/contracts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type GitRepositoryLayout,
  gitWorktreePath,
} from '../../domain/source/git-repository-layout.ts';
import {
  SourceDriverMismatchException,
  SourceMaterializationAbsentException,
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitRemote, hasGitVcs } from '../../domain/source/vcs-capability.ts';

export interface ManagedGitLayout {
  url: string;
  activeBranch: string;
  layout: GitRepositoryLayout;
  worktreeId: string;
}

export type ResolvedGitWorktree =
  | {
      kind: 'managed';
      cwd: string;
      record: SourceRecord;
      config: ManagedGitLayout;
    }
  | {
      kind: 'inplace';
      cwd: string;
      record: SourceRecord;
    };

export interface ResolveGitWorktreeDeps {
  sources: SourceRegistryPort;
  materializations: SourceMaterializationPort;
  layout: HostFsLayoutPort;
  hostId: string;
}

export interface ResolveGitWorktreeOptions {
  hostId: string;
  worktreeId?: string;
}

export function resolveGitWorktree(
  deps: ResolveGitWorktreeDeps,
  orgId: string,
  sourceId: string,
  options?: { worktreeId?: string },
): ResolvedGitWorktree {
  const record = deps.sources.findById(orgId, sourceId);
  if (!record) {
    throw new SourceNotFoundException(sourceId);
  }
  if (!hasGitVcs(record)) {
    throw new SourceDriverMismatchException(sourceId, 'git', 'no-vcs');
  }
  const materialization = deps.materializations.find(orgId, sourceId, deps.hostId);
  if (materialization?.state !== 'ready') {
    throw new SourceMaterializationAbsentException(sourceId, deps.hostId);
  }
  if (materialization.origin === 'managed' && hasGitRemote(record)) {
    const layout: GitRepositoryLayout = {
      bareRepoPath: deps.layout.orgSourceDir(orgId, sourceId),
      worktreesRoot: deps.layout.sourceWorktreesDir(orgId, sourceId),
    };
    const activeBranch = record.vcs?.defaultBranch?.trim() || 'main';
    const worktreeId = options?.worktreeId?.trim() || inferWorktreeId(materialization.localPath);
    if (!worktreeId) {
      throw new SourcePathInvalidException('worktreeId is required for git checkout operations');
    }
    const cwd = gitWorktreePath(layout, worktreeId);
    return {
      kind: 'managed',
      cwd,
      record,
      config: {
        url: record.vcs?.remoteUrl ?? '',
        activeBranch,
        layout,
        worktreeId,
      },
    };
  }
  const cwd = materialization.localPath;
  if (!cwd) {
    throw new SourceMaterializationAbsentException(sourceId, deps.hostId);
  }
  return {
    kind: 'inplace',
    cwd,
    record,
  };
}

function inferWorktreeId(localPath: string | null): string | null {
  if (!localPath) {
    return null;
  }
  const parts = localPath.split(/[/\\]/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last || null;
}

export function resolveStandaloneRepoRoot(options: {
  sourceId: string;
  hostId: string;
  origin: MaterializationOrigin | null | undefined;
  localPath: string | null;
  managedBarePath: string;
}): string {
  if (options.origin === 'managed') {
    return options.managedBarePath;
  }
  if (!options.localPath) {
    throw new SourceMaterializationAbsentException(options.sourceId, options.hostId);
  }
  return options.localPath;
}
