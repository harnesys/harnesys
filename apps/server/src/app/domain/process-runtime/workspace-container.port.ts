export interface WorkspaceContainerEnsureInput {
  orgId: string;
  workspaceKey: string;
  image: string;
  mounts: readonly string[];
}

export interface WorkspaceContainerRef {
  containerId: string;
  name: string;
}

export abstract class WorkspaceContainerPort {
  abstract ensure(input: WorkspaceContainerEnsureInput): Promise<WorkspaceContainerRef>;
  abstract release(orgId: string, workspaceKey: string): Promise<void>;
  abstract reconcile(orgId: string): Promise<void>;
  abstract probe(): Promise<boolean>;
}
