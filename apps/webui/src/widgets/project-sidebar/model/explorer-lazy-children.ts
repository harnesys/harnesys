import type { ProjectFileEntry } from '@harnesys/studio-shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { listSourceFiles } from '@/shared/api/files';
import { parentDir } from './file-tree-index';
export interface LazyChildrenState {
  fetched: Set<string>;
  roots: Set<string>;
}
export function createLazyChildrenState(): LazyChildrenState {
  return { fetched: new Set(), roots: new Set() };
}
export function ensurePrunedChildren(args: {
  qc: QueryClient;
  treeKey: QueryKey;
  projectId: string;
  dirPath: string;
  state: LazyChildrenState;
}): void {
  const { qc, treeKey, projectId, dirPath, state } = args;
  const cached = qc.getQueryData<ProjectFileEntry[]>(treeKey) ?? [];
  const entry = cached.find((item) => item.path === dirPath);
  if (entry?.kind !== 'dir') {
    return;
  }
  if (cached.some((item) => parentDir(item.path) === dirPath)) {
    return;
  }
  if (state.fetched.has(dirPath)) {
    return;
  }
  const underLazyRoot = [...state.roots].some(
    (root) => dirPath === root || dirPath.startsWith(`${root}/`),
  );
  if (entry.pruned !== true && !underLazyRoot) {
    return;
  }
  state.fetched.add(dirPath);
  void listSourceFiles(projectId, dirPath)
    .then((fetched) => {
      qc.setQueryData<ProjectFileEntry[]>(treeKey, (old) => {
        const prev = old ?? [];
        const seen = new Set(prev.map((item) => item.path));
        const merged = prev.map((item) =>
          item.path === dirPath && item.pruned ? { ...item, pruned: false } : item,
        );
        for (const item of fetched) {
          const path = dirPath ? `${dirPath}/${item.name}` : item.name;
          if (!seen.has(path)) {
            seen.add(path);
            merged.push({ ...item, path });
          }
        }
        return merged;
      });
      state.roots.add(dirPath);
    })
    .catch(() => {
      state.fetched.delete(dirPath);
    });
}
