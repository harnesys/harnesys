import type {
  RunEnvironment,
  RunEnvironmentAnchor,
  RunEnvironmentProvenance,
  WorkspaceRef,
} from '@harnesys/contracts';

export type {
  RunEnvironment,
  RunEnvironmentAnchor,
  RunEnvironmentProvenance,
  WorkspaceRef,
} from '@harnesys/contracts';

export const WORKSPACE_LAYER_ORDER = ['run', 'thread', 'agent'] as const;
export type WorkspaceLayerOrigin = (typeof WORKSPACE_LAYER_ORDER)[number];

export interface WorkspaceLayer {
  origin: WorkspaceLayerOrigin;
  ref: WorkspaceRef | null;
}

export interface ResolveEnvironmentInput {
  layers: WorkspaceLayer[];
  issue: boolean;
  branch?: string;
}

export const WORKSPACE_PROVENANCE_LABEL: Record<RunEnvironmentProvenance, string> = {
  run: 'this run',
  thread: 'thread',
  agent: 'agent default',
  fallback: 'sandbox',
};

export function resolveEnvironment(input: ResolveEnvironmentInput): RunEnvironment {
  const layers = orderedLayers(input.layers);
  const winner = layers.find((layer) => isConcrete(layer.ref));
  const branch = input.branch !== undefined ? { branch: input.branch } : {};
  if (winner === undefined) {
    return { anchor: null, cwd: 'sandbox', provenance: 'fallback', ...branch };
  }
  const ref = winner.ref;
  if (ref === null || ref.kind === 'inherit') {
    return { anchor: null, cwd: 'sandbox', provenance: 'fallback', ...branch };
  }
  const provenance = winner.origin;
  if (ref.kind === 'sandbox') {
    return { anchor: null, cwd: 'sandbox', provenance, ...branch };
  }
  if (ref.kind === 'folder') {
    return { anchor: folderAnchorOf(ref), cwd: 'anchor', provenance, ...branch };
  }
  const subpath = composedSubpath(layers, ref.sourceId, ref);
  const anchor =
    ref.kind === 'worktree'
      ? { kind: 'source' as const, sourceId: ref.sourceId, worktreeId: ref.worktreeId }
      : { kind: 'source' as const, sourceId: ref.sourceId };
  return {
    anchor,
    ...(subpath !== undefined ? { subpath } : {}),
    cwd: ref.kind === 'worktree' ? 'anchor' : sourceCwdOf(winner.origin, input.issue),
    provenance,
    ...branch,
  };
}

export function describeEnvironment(
  environment: RunEnvironment,
  sourceNameOf: (sourceId: string) => string,
): string {
  const anchor = environment.anchor;
  if (anchor === null) {
    return 'Thread sandbox';
  }
  let label: string;
  if (anchor.kind === 'folder') {
    label = anchor.path;
  } else if (anchor.worktreeId !== undefined) {
    label = `${sourceNameOf(anchor.sourceId)} · worktree ${anchor.worktreeId.slice(0, 8)}`;
  } else {
    label = sourceNameOf(anchor.sourceId);
  }
  if (environment.subpath !== undefined) {
    label = `${label}/${environment.subpath}`;
  }
  return label;
}

function orderedLayers(layers: WorkspaceLayer[]): WorkspaceLayer[] {
  const rank = new Map(WORKSPACE_LAYER_ORDER.map((origin, index) => [origin, index] as const));
  return [...layers].sort((a, b) => (rank.get(a.origin) ?? 0) - (rank.get(b.origin) ?? 0));
}

function isConcrete(ref: WorkspaceRef | null): ref is WorkspaceRef {
  return ref !== null && ref.kind !== 'inherit';
}

function composedSubpath(
  layers: WorkspaceLayer[],
  sourceId: string,
  winner: WorkspaceRef,
): string | undefined {
  if ((winner.kind === 'source' || winner.kind === 'worktree') && winner.subpath !== undefined) {
    return winner.subpath;
  }
  for (const layer of layers) {
    const ref = layer.ref;
    if (ref === null || ref.kind === 'inherit') {
      continue;
    }
    if (
      (ref.kind === 'source' || ref.kind === 'worktree') &&
      ref.sourceId === sourceId &&
      ref.subpath !== undefined
    ) {
      return ref.subpath;
    }
  }
  return undefined;
}

function sourceCwdOf(origin: WorkspaceLayerOrigin, issue: boolean): 'sandbox' | 'anchor' {
  if (origin === 'run') {
    return issue ? 'anchor' : 'sandbox';
  }
  return 'anchor';
}

function folderAnchorOf(ref: { hostId?: string; path: string }): RunEnvironmentAnchor {
  return {
    kind: 'folder',
    path: ref.path,
    ...(ref.hostId !== undefined ? { hostId: ref.hostId } : {}),
  };
}
