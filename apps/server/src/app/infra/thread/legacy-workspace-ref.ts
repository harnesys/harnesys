import type { WorkspaceRef } from '@harnesys/contracts';
import { WorkspaceRefSchema } from '@harnesys/contracts';

export interface SourceRoot {
  sourceId: string;
  root: string;
}

export function parseWorkspaceRef(raw: unknown): WorkspaceRef | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const result = WorkspaceRefSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function mapLegacyDirectory(input: {
  runDirectory: string;
  sourceRoots: ReadonlyArray<SourceRoot>;
}): WorkspaceRef | null {
  const directory = normalizeDirectory(input.runDirectory);
  if (directory === null) {
    return null;
  }
  const match = matchSourceRoot(directory, input.sourceRoots);
  if (match === null) {
    return { kind: 'folder', path: directory };
  }
  if (match.subpath === null) {
    return { kind: 'source', sourceId: match.sourceId };
  }
  return { kind: 'source', sourceId: match.sourceId, subpath: match.subpath };
}

export function projectLegacyRunDirectory(
  ref: WorkspaceRef | null,
  sourceRoots: ReadonlyArray<SourceRoot>,
): string | null {
  if (ref === null) {
    return null;
  }
  if (ref.kind === 'folder') {
    return normalizeDirectory(ref.path);
  }
  if (ref.kind !== 'source') {
    return null;
  }
  const source = sourceRoots.find((item) => item.sourceId === ref.sourceId);
  if (source === undefined) {
    return null;
  }
  const root = normalizeDirectory(source.root);
  if (root === null) {
    return null;
  }
  const subpath = ref.subpath === undefined ? '' : normalizeSubpath(ref.subpath);
  if (subpath.length === 0) {
    return root;
  }
  return root === '/' ? `/${subpath}` : `${root}/${subpath}`;
}

interface SourceRootMatch {
  sourceId: string;
  subpath: string | null;
}

function matchSourceRoot(
  directory: string,
  sourceRoots: ReadonlyArray<SourceRoot>,
): SourceRootMatch | null {
  let best: SourceRootMatch | null = null;
  let bestLength = 0;
  for (const source of sourceRoots) {
    const root = normalizeDirectory(source.root);
    if (root === null) {
      continue;
    }
    if (directory === root) {
      return { sourceId: source.sourceId, subpath: null };
    }
    const prefix = root === '/' ? '/' : `${root}/`;
    if (!directory.startsWith(prefix)) {
      continue;
    }
    const subpath = directory.slice(prefix.length);
    if (subpath.length === 0 || root.length <= bestLength) {
      continue;
    }
    best = { sourceId: source.sourceId, subpath };
    bestLength = root.length;
  }
  return best;
}

function normalizeDirectory(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const stripped = trimmed.replace(/\/+$/, '');
  return stripped.length === 0 ? '/' : stripped;
}

function normalizeSubpath(subpath: string): string {
  return subpath.replace(/^\/+/, '').replace(/\/+$/, '');
}
