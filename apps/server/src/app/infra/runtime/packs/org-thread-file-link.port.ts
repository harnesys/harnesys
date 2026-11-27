import { statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  CapabilityScope,
  ThreadFileLinkInput,
  ThreadFileLinkRecord,
  ThreadFileLinkTarget,
} from 'harnesys';
import { ThreadFileLinkPort } from 'harnesys';
import {
  resolveThreadEntryPath,
  threadFileContentType,
} from '../../../application/threads/thread-files-paths.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { kindFromMediaType } from '../../../domain/thread/attachment.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';

export interface OrgThreadFileLinkPortDeps {
  threads: ThreadRepositoryPort;
  layout: HostFsLayoutPort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  machineConfig: MachineConfigPort;
}

function insideRoot(abs: string, root: string): string | null {
  const rel = relative(root, abs);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return rel.replaceAll(sep, '/');
}

export class OrgThreadFileLinkPort extends ThreadFileLinkPort {
  constructor(private readonly deps: OrgThreadFileLinkPortDeps) {
    super();
  }

  async link(scope: CapabilityScope, input: ThreadFileLinkInput): Promise<ThreadFileLinkRecord> {
    const absolute = resolve(input.path);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      throw new Error(`File not found: ${input.path}`);
    }
    const target = this.resolveTarget(scope, absolute);
    if (target === null) {
      throw new Error(
        `Not linkable: ${input.path} is outside the thread dir and connected sources — attach it with mode "copy"`,
      );
    }
    const mediaType = threadFileContentType(basename(absolute));
    return {
      ...target,
      name: basename(absolute),
      mediaType,
      kind: kindFromMediaType(mediaType),
      sizeBytes: stat.size,
    };
  }

  private resolveTarget(scope: CapabilityScope, absolute: string): ThreadFileLinkTarget | null {
    const { orgId, threadId } = scope;
    const threadDir = this.deps.layout.threadDir(orgId, threadId);
    const threadRel = insideRoot(absolute, threadDir);
    if (threadRel !== null && resolveThreadEntryPath(threadDir, threadRel) !== null) {
      return { source: 'thread', threadId, path: threadRel };
    }
    const bound = this.boundWorkspaceTarget(scope, absolute);
    if (bound !== null) {
      return bound;
    }
    return this.scannedSourceTarget(scope, absolute);
  }

  private boundWorkspaceTarget(
    scope: CapabilityScope,
    absolute: string,
  ): ThreadFileLinkTarget | null {
    const thread = this.deps.threads.findById(scope.orgId, scope.threadId);
    const ref = thread?.workspaceRef;
    if (ref?.kind !== 'source' && ref?.kind !== 'worktree') {
      return null;
    }
    const root = this.sourceRoot(
      scope,
      ref.sourceId,
      ref.kind === 'worktree' ? ref.worktreeId : undefined,
      ref.subpath,
    );
    if (root === null) {
      return null;
    }
    const rel = insideRoot(absolute, root);
    if (rel === null) {
      return null;
    }
    return {
      source: 'project',
      projectId: ref.sourceId,
      path: rel,
      ...(ref.kind === 'worktree' ? { worktreeId: ref.worktreeId } : {}),
    };
  }

  private scannedSourceTarget(
    scope: CapabilityScope,
    absolute: string,
  ): ThreadFileLinkTarget | null {
    let best: { sourceId: string; root: string } | null = null;
    for (const source of this.deps.sources.list(scope.orgId)) {
      const root = this.sourceRoot(scope, source.id);
      if (root === null || !insideRoot(absolute, root)) {
        continue;
      }
      if (!best || root.length > best.root.length) {
        best = { sourceId: source.id, root };
      }
    }
    if (best === null) {
      return null;
    }
    const rel = insideRoot(absolute, best.root);
    return rel === null ? null : { source: 'project', projectId: best.sourceId, path: rel };
  }

  private sourceRoot(
    scope: CapabilityScope,
    sourceId: string,
    worktreeId?: string,
    subpath?: string,
  ): string | null {
    const hostId = this.deps.machineConfig.get().id;
    try {
      const location = this.deps.sourceLocation.resolve({
        orgId: scope.orgId,
        sourceId,
        hostId,
        ...(worktreeId !== undefined ? { worktreeId } : {}),
      });
      const root = subpath ? join(location.absoluteRoot, subpath) : location.absoluteRoot;
      return resolve(root);
    } catch {
      return null;
    }
  }
}
