import { mkdirSync } from 'node:fs';
import type { RunEnvironmentAnchor } from '@harnesys/contracts';
import { materializePrimary } from '../../domain/thread/run-environment.ts';
import type { WorkerTargetInput } from './work-executor.util.ts';

export interface WorktreeSelection {
  sourceId: string;
  worktreeId: string;
}

export interface PrimaryTarget {
  directory: string;
  requireDirectory: boolean;
}

export function primaryTargetOf(
  input: WorkerTargetInput,
  threadDir: string,
  worktreeRoot: string | undefined,
): PrimaryTarget {
  const environment = input.environment;
  if (environment === undefined) {
    if (input.directory !== undefined) {
      return { directory: input.directory, requireDirectory: true };
    }
    return { directory: worktreeRoot ?? threadDir, requireDirectory: false };
  }
  const anchor = environment.anchor;
  if (anchor === null || environment.cwd === 'sandbox') {
    return { directory: threadDir, requireDirectory: false };
  }
  if (anchor.kind === 'folder') {
    return { directory: anchor.path, requireDirectory: true };
  }
  const root =
    worktreeRoot ??
    input.sourceLocation.resolve({
      orgId: input.orgId,
      sourceId: anchor.sourceId,
      hostId: input.machineConfig.get().id,
    }).absoluteRoot;
  const primary = materializePrimary(environment, {
    anchorRoot: root,
    threadDir,
  });
  if (environment.subpath !== undefined) {
    mkdirSync(primary.primaryDirectory, { recursive: true });
  }
  return { directory: primary.primaryDirectory, requireDirectory: false };
}

export function worktreeSelectionOf(
  input: WorkerTargetInput,
  anchor: RunEnvironmentAnchor | null,
): WorktreeSelection | null {
  if (input.environment !== undefined) {
    return anchor?.kind === 'source' && anchor.worktreeId !== undefined
      ? { sourceId: anchor.sourceId, worktreeId: anchor.worktreeId }
      : null;
  }
  return input.sourceId !== undefined && input.worktreeId !== undefined
    ? { sourceId: input.sourceId, worktreeId: input.worktreeId }
    : null;
}

export function resolveWorktreeRoot(
  input: WorkerTargetInput,
  localHostId: string,
  worktree: WorktreeSelection,
): string {
  const location = input.sourceLocation.resolve({
    orgId: input.orgId,
    sourceId: worktree.sourceId,
    hostId: localHostId,
    worktreeId: worktree.worktreeId,
  });
  return location.absoluteRoot;
}
