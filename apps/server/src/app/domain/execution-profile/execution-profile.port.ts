import type {
  CreateExecutionProfileInput,
  ExecutionProfileRecord,
  ProfileUsage,
  UpdateExecutionProfileInput,
} from './execution-profile.ts';

export abstract class ExecutionProfilePort {
  abstract list(orgId: string): ExecutionProfileRecord[];
  abstract findById(orgId: string, profileId: string): ExecutionProfileRecord | undefined;
  abstract findByName(orgId: string, name: string): ExecutionProfileRecord | undefined;
  abstract insert(orgId: string, input: CreateExecutionProfileInput): ExecutionProfileRecord;
  abstract update(
    orgId: string,
    profileId: string,
    input: UpdateExecutionProfileInput,
  ): ExecutionProfileRecord;
  abstract setNodes(orgId: string, profileId: string, nodeIds: string[]): ExecutionProfileRecord;
  abstract removeNodeFromAll(orgId: string, nodeId: string): void;
  abstract getDefault(orgId: string): string | undefined;
  abstract setDefault(orgId: string, profileId: string): void;
  abstract delete(orgId: string, profileId: string): void;
  abstract ensureLocalDefault(orgId: string, relayNodeId: string): ExecutionProfileRecord;
  abstract countUsage(orgId: string, profileId: string): ProfileUsage;
}
