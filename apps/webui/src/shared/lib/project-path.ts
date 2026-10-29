import type { ProjectMoveItem } from '@harnesys/studio-shared';
export function normalizeProjectPath(path: string): string {
  return path.replace(/^\/+/, '').replaceAll('\\', '/');
}
export function projectDirname(path: string): string {
  const normalized = normalizeProjectPath(path);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? '' : normalized.slice(0, slash);
}
export function projectBasename(path: string): string {
  const normalized = normalizeProjectPath(path);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}
export function joinProjectPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
export function isSameOrInsidePath(candidate: string, parent: string): boolean {
  const c = normalizeProjectPath(candidate);
  const p = normalizeProjectPath(parent);
  return c === p || c.startsWith(`${p}/`);
}
export function remapProjectPath(path: string, moves: ProjectMoveItem[]): string {
  const normalized = normalizeProjectPath(path);
  for (const move of moves) {
    if (isSameOrInsidePath(normalized, move.from)) {
      return move.to + normalized.slice(move.from.length);
    }
  }
  return normalized;
}
export function pathEquals(a: string, b: string): boolean {
  return normalizeProjectPath(a) === normalizeProjectPath(b);
}
