import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { gitWorktreePath } from '../../domain/source/git-repository-layout.ts';
import {
  SourceHostMismatchException,
  SourceMaterializationAbsentException,
  SourceMaterializationFailedException,
} from '../../domain/source/source.error.ts';
import {
  type ResolvedSourceLocation,
  type ResolveSourceLocationInput,
  SourceLocationPort,
} from '../../domain/source/source-location.port.ts';
import type { MaterializationRecord } from '../../domain/source/source-materialization.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { boundHostId } from '../../domain/source/ui-visibility.policy.ts';
import { resolveContentRoot } from '../content/fs-content-ops.ts';

export type ResolveContentRootFn = (absolutePath: string) => string;

export interface ResolveSourceLocationDeps {
  findSource: (orgId: string, sourceId: string) => SourceRecord | null;
  findMaterialization: (
    orgId: string,
    sourceId: string,
    hostId: string,
  ) => MaterializationRecord | null;
  managedRoot: (orgId: string, sourceId: string) => string;
  worktreesRoot?: (orgId: string, sourceId: string) => string;
}

@Injectable()
export class SourceLocationAdapter extends SourceLocationPort {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
  ) {
    super();
  }

  resolve(input: ResolveSourceLocationInput): ResolvedSourceLocation {
    return resolveSourceLocation(
      {
        findSource: (orgId, sourceId) => this.sources.findById(orgId, sourceId),
        findMaterialization: (orgId, sourceId, hostId) =>
          this.materializations.find(orgId, sourceId, hostId),
        managedRoot: (orgId, sourceId) => this.layout.orgSourceDir(orgId, sourceId),
        worktreesRoot: (orgId, sourceId) => this.layout.sourceWorktreesDir(orgId, sourceId),
      },
      input,
      resolveContentRoot,
    );
  }
}

export function resolveSourceLocation(
  deps: ResolveSourceLocationDeps,
  input: ResolveSourceLocationInput,
  resolveRoot: ResolveContentRootFn,
): ResolvedSourceLocation {
  const source = deps.findSource(input.orgId, input.sourceId);
  const materialization = deps.findMaterialization(input.orgId, input.sourceId, input.hostId);
  if (source) {
    const bound = boundHostId(source.distribution);
    if (bound !== null && bound !== input.hostId) {
      throw new SourceHostMismatchException(input.sourceId, bound, input.hostId);
    }
  } else if (materialization?.state !== 'ready' || !materialization?.localPath) {
    throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
  }
  if (
    !materialization ||
    materialization.state === 'absent' ||
    materialization.state === 'materializing'
  ) {
    throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
  }
  if (materialization.state === 'failed') {
    throw new SourceMaterializationFailedException(
      input.sourceId,
      input.hostId,
      materialization.lastError ?? 'materialization failed',
    );
  }
  const absolutePath = resolveMaterializedPath(deps, input, materialization);
  if (!absolutePath) {
    throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
  }
  try {
    const absoluteRoot = resolveRoot(absolutePath);
    return { sourceId: input.sourceId, hostId: input.hostId, absoluteRoot };
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new SourceMaterializationFailedException(input.sourceId, input.hostId, cause);
  }
}

function resolveMaterializedPath(
  deps: ResolveSourceLocationDeps,
  input: ResolveSourceLocationInput,
  materialization: MaterializationRecord,
): string | null {
  const worktreeId = input.worktreeId?.trim();
  if (worktreeId && deps.worktreesRoot) {
    return gitWorktreePath(
      {
        bareRepoPath: deps.managedRoot(input.orgId, input.sourceId),
        worktreesRoot: deps.worktreesRoot(input.orgId, input.sourceId),
      },
      worktreeId,
    );
  }
  if (materialization.localPath) {
    return materialization.localPath;
  }
  if (materialization.origin === 'managed') {
    return deps.managedRoot(input.orgId, input.sourceId);
  }
  return null;
}
