import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { normalizeProjectPath, remapProjectPath } from '@/shared/lib/project-path.ts';

const RECENT_MOVES_TTL_MS = 3000;
let recent: {
  projectId: string;
  moves: ProjectMoveItem[];
  at: number;
} | null = null;
export function rememberProjectMoves(projectId: string, moves: ProjectMoveItem[]): void {
  recent = moves.length > 0 ? { projectId, moves, at: Date.now() } : null;
}
export function remappedPathAfterMove(projectId: string, path: string): string | null {
  if (!recent || recent.projectId !== projectId) {
    return null;
  }
  if (Date.now() - recent.at > RECENT_MOVES_TTL_MS) {
    recent = null;
    return null;
  }
  const current = normalizeProjectPath(path);
  const next = remapProjectPath(current, recent.moves);
  return next === current ? null : next;
}
