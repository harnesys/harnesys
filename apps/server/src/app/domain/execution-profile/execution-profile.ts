export const LOCAL_EXECUTION_PROFILE_ID = 'local';
export const LOCAL_EXECUTION_PROFILE_NAME = 'Local';

export type ExecutionProfileIsolation = 'host' | 'container';

export interface ExecutionProfileRecord {
  id: string;
  orgId: string;
  name: string;
  system: boolean;
  nodeIds: string[];
  isolation: ExecutionProfileIsolation;
  dockerImage: string | null;
}

export interface CreateExecutionProfileInput {
  name: string;
}

export interface UpdateExecutionProfileInput {
  name?: string;
  isolation?: ExecutionProfileIsolation;
  dockerImage?: string | null;
}

export interface ProfileUsage {
  orgDefault: boolean;
  agents: number;
  boardRules: number;
}
