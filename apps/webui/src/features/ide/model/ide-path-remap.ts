import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { normalizeProjectPath, remapProjectPath } from '@/shared/lib/project-path.ts';
import type { IdeTab } from './ide.store';
import type { IdeWorkspaceState } from './ide-layout';
import { fileTabKey, tabIdFor } from './ide-persist';
export interface IdePathRemap {
  tabs: IdeTab[];
  idByOldId: Map<string, string>;
}
export function remapTabPaths(
  tabs: IdeTab[],
  moves: ProjectMoveItem[],
  projectId: string,
  worktreeId?: string,
): IdePathRemap {
  const idByOldId = new Map<string, string>();
  const next = tabs.map((tab) => {
    if (tab.projectId !== projectId || (tab.kind !== 'file' && tab.kind !== 'diff') || !tab.path) {
      return tab;
    }
    if ((tab.worktreeId ?? null) !== (worktreeId ?? null)) {
      return tab;
    }
    const currentPath = normalizeProjectPath(tab.path);
    const nextPath = remapProjectPath(currentPath, moves);
    if (nextPath === currentPath) {
      return tab;
    }
    const id = tabIdFor(tab.kind, tab.projectId, fileTabKey(nextPath, tab.worktreeId));
    idByOldId.set(tab.id, id);
    return { ...tab, id, path: nextPath };
  });
  return { tabs: next, idByOldId };
}
export function remapProjectPaths(
  ws: IdeWorkspaceState,
  moves: ProjectMoveItem[],
  projectId: string,
  worktreeId?: string,
): IdeWorkspaceState | null {
  const { tabs, idByOldId } = remapTabPaths(ws.tabs, moves, projectId, worktreeId);
  if (idByOldId.size === 0) {
    return null;
  }
  const remapId = (id: string) => idByOldId.get(id) ?? id;
  return {
    ...ws,
    tabs,
    activeId: ws.activeId ? remapId(ws.activeId) : null,
    groups: ws.groups.map((group) => ({
      ...group,
      tabIds: group.tabIds.map(remapId),
      activeId: group.activeId ? remapId(group.activeId) : null,
    })),
  };
}
