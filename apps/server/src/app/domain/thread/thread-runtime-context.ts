export type PrimaryKind = 'sandbox' | 'directory' | 'worktree' | 'source';

export interface SharedSourceRef {
  id: string;
  name: string;
  description: string | null;
}

export interface PrimarySourceRef {
  sourceId: string;
  name: string;
  kind: 'git' | 'folder';
}

export interface ActiveWorktreeRef {
  worktreeId: string;
  sourceId: string;
  hostId: string;
  root: string;
}

export interface ThreadRuntimeContext {
  hostId: string;
  runtime: 'host' | 'container';
  primaryDirectory: string;
  primaryKind: PrimaryKind;
  threadDir: string;
  threadSandbox: string;
  activeWorktree?: ActiveWorktreeRef;
  primarySource?: PrimarySourceRef;
  sharedSources: SharedSourceRef[];
}

export interface ThreadRuntimeContextMaterial {
  hostId: string;
  runtime: 'host' | 'container';
  threadDir: string;
  threadSandbox: string;
  primary?: { directory: string; kind: PrimaryKind };
  worktree?: ActiveWorktreeRef;
  primarySource?: PrimarySourceRef & { root: string };
  sharedSources: SharedSourceRef[];
}

export function threadRuntimeContextOf(
  material: ThreadRuntimeContextMaterial,
): ThreadRuntimeContext {
  const worktree = material.worktree;
  if (worktree !== undefined) {
    return {
      hostId: material.hostId,
      runtime: material.runtime,
      primaryDirectory: worktree.root,
      primaryKind: 'worktree',
      threadDir: material.threadDir,
      threadSandbox: material.threadSandbox,
      activeWorktree: worktree,
      sharedSources: material.sharedSources,
    };
  }
  const primarySource = material.primarySource;
  if (primarySource !== undefined) {
    return {
      hostId: material.hostId,
      runtime: material.runtime,
      primaryDirectory: primarySource.root,
      primaryKind: 'source',
      threadDir: material.threadDir,
      threadSandbox: material.threadSandbox,
      primarySource: {
        sourceId: primarySource.sourceId,
        name: primarySource.name,
        kind: primarySource.kind,
      },
      sharedSources: material.sharedSources,
    };
  }
  const primary = material.primary;
  if (primary !== undefined) {
    return {
      hostId: material.hostId,
      runtime: material.runtime,
      primaryDirectory: primary.directory,
      primaryKind: primary.kind,
      threadDir: material.threadDir,
      threadSandbox: material.threadSandbox,
      sharedSources: material.sharedSources,
    };
  }
  return {
    hostId: material.hostId,
    runtime: material.runtime,
    primaryDirectory: material.threadDir,
    primaryKind: 'sandbox',
    threadDir: material.threadDir,
    threadSandbox: material.threadSandbox,
    sharedSources: material.sharedSources,
  };
}
