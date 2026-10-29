import type { AgentPatch, AgentRecord } from './agent.ts';

export abstract class AgentRegistryPort {
  abstract list(orgId: string): AgentRecord[];
  abstract findById(orgId: string, id: string): AgentRecord | undefined;
  abstract findByName(orgId: string, name: string): AgentRecord | undefined;
  abstract insert(rec: AgentRecord): AgentRecord;
  abstract update(orgId: string, id: string, patch: AgentPatch): AgentRecord;
  abstract delete(orgId: string, id: string): void;
}
