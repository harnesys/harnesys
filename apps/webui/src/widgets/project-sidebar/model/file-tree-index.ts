import type { ProjectFileEntry } from '@harnesys/studio-shared';
export function parentDir(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}
export function indexFileTree(entries: ProjectFileEntry[]): Map<string, ProjectFileEntry[]> {
  const map = new Map<string, ProjectFileEntry[]>();
  for (const entry of entries) {
    const parent = parentDir(entry.path);
    const list = map.get(parent);
    if (list) {
      list.push(entry);
    } else {
      map.set(parent, [entry]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  return map;
}
export function childrenOf(
  index: Map<string, ProjectFileEntry[]>,
  parentPath: string,
  showHidden: boolean,
): ProjectFileEntry[] {
  const list = index.get(parentPath) ?? [];
  if (showHidden) {
    return list;
  }
  return list.filter((entry) => !entry.name.startsWith('.'));
}
export interface FlatTreeRow {
  kind: 'entry' | 'loading' | 'create';
  entry?: ProjectFileEntry;
  fullPath: string;
  depth: number;
  childCount: number;
  createKind?: 'file' | 'dir';
}
export function flattenFileTree({
  index,
  showHidden,
  expandedDirs,
  depthOffset = 0,
  createDraft = null,
}: {
  index: Map<string, ProjectFileEntry[]>;
  showHidden: boolean;
  expandedDirs: Set<string>;
  depthOffset?: number;
  createDraft?: { kind: 'file' | 'dir'; parentPath: string } | null;
}): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  const walk = (parentPath: string, depth: number) => {
    for (const entry of childrenOf(index, parentPath, showHidden)) {
      const children = entry.kind === 'dir' ? childrenOf(index, entry.path, showHidden) : [];
      rows.push({ kind: 'entry', entry, fullPath: entry.path, depth, childCount: children.length });
      if (entry.kind === 'dir' && createDraft && createDraft.parentPath === entry.path) {
        rows.push({
          kind: 'create',
          fullPath: entry.path,
          depth: depth + 1,
          childCount: 0,
          createKind: createDraft.kind,
        });
      }
      if (entry.kind === 'dir' && expandedDirs.has(entry.path)) {
        if (children.length === 0 && entry.pruned === true) {
          rows.push({ kind: 'loading', fullPath: entry.path, depth: depth + 1, childCount: 0 });
        } else {
          walk(entry.path, depth + 1);
        }
      }
    }
  };
  walk('', depthOffset);
  return rows;
}
