export interface PendingReveal {
  path: string;
  lineNumber: number;
  column: number;
}
let pending: PendingReveal | null = null;
function normalize(path: string): string {
  return path.replace(/^\/+/, '');
}
export function setPendingReveal(target: PendingReveal): void {
  pending = target;
}
export function takePendingReveal(path: string): PendingReveal | null {
  if (!pending || normalize(pending.path) !== normalize(path)) {
    return null;
  }
  const target = pending;
  pending = null;
  return target;
}
