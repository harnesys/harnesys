import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { remapProjectPath } from '@/shared/lib/project-path.ts';
import type { ProjectOpenFiles } from './desk.store';
export function remapProjectOpenFiles(
  files: ProjectOpenFiles,
  moves: ProjectMoveItem[],
): ProjectOpenFiles {
  let changed = false;
  const tabs = files.tabs.map((tab) => {
    const nextPath = remapProjectPath(tab.path, moves);
    if (nextPath === tab.path) {
      return tab;
    }
    changed = true;
    return { ...tab, path: nextPath };
  });
  if (!changed) {
    return files;
  }
  const activePath = files.activePath ? remapProjectPath(files.activePath, moves) : null;
  return { tabs, activePath };
}
