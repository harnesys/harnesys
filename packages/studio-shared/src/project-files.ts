export type ProjectFileEventKind = 'change' | 'create' | 'delete';
export interface ProjectFileEvent {
  kind: ProjectFileEventKind;
  dir: string;
  name: string;
}
export interface ProjectMoveItem {
  from: string;
  to: string;
}
export interface ProjectMoveResult {
  moved: ProjectMoveItem[];
}
