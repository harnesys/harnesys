export interface MoveDrag {
  projectId: string;
  worktreeId?: string;
  paths: string[];
}
export const MOVE_DRAG_MIME = 'application/harnesys-move';
let drag: MoveDrag | null = null;
export function setMoveDrag(next: MoveDrag | null): void {
  drag = next;
}
export function moveDrag(): MoveDrag | null {
  return drag;
}

export function sameMoveScope(
  drag: MoveDrag | null,
  projectId: string,
  worktreeId?: string | null,
): boolean {
  if (!drag || drag.projectId !== projectId) {
    return false;
  }
  return (drag.worktreeId ?? null) === (worktreeId ?? null);
}
export function takeMoveDrag(): MoveDrag | null {
  const current = drag;
  drag = null;
  return current;
}
