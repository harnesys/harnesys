import type { WorkspaceRef } from '@harnesys/contracts';

export interface TriggerWorkspaceInput {
  orgId: string;
  threadId: string;
  workspace: WorkspaceRef;
}

export abstract class TriggerWorkspacePort {
  abstract apply(input: TriggerWorkspaceInput): boolean;
}
