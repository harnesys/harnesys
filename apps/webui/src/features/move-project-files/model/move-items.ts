import type { ProjectMoveItem } from '@harnesys/studio-shared';
import {
  isSameOrInsidePath,
  joinProjectPath,
  normalizeProjectPath,
  projectBasename,
  projectDirname,
} from '@/shared/lib/project-path.ts';

const INVALID_NAME_RE = /[/\\:*?"<>|\0]/;
export function isValidFileName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 && trimmed !== '.' && trimmed !== '..' && !INVALID_NAME_RE.test(trimmed)
  );
}
export function collapseToRoots(paths: string[]): string[] {
  const unique = [...new Set(paths.map(normalizeProjectPath))];
  return unique.filter(
    (path) => !unique.some((other) => other !== path && isSameOrInsidePath(path, other)),
  );
}
export function canDropInto(paths: string[], targetDir: string): boolean {
  const target = normalizeProjectPath(targetDir);
  return paths.every((path) => !isSameOrInsidePath(target, path));
}
export function buildMoveItems(paths: string[], targetDir: string): ProjectMoveItem[] {
  return collapseToRoots(paths)
    .map((from) => ({ from, to: joinProjectPath(targetDir, projectBasename(from)) }))
    .filter((item) => item.from !== item.to);
}
export function buildRenameItem(path: string, newName: string): ProjectMoveItem {
  const from = normalizeProjectPath(path);
  return { from, to: joinProjectPath(projectDirname(from), newName.trim()) };
}
