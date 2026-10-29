import { Injectable } from '@harnesys/brix';
import type { ListSemanticQuery, MemoryRecord } from '@harnesys/contracts';
import type { MemoryScopeId } from 'harnesys';
import { AgentSemanticStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface ListSemanticRequest extends ListSemanticQuery {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListSemanticUseCase {
  constructor(
    private readonly semantic: AgentSemanticStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: ListSemanticRequest): Promise<MemoryRecord[]> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    return this.semantic.list(scope, { scope: request.scope, limit: request.limit });
  }
}
