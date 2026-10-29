import { Injectable } from '@harnesys/brix';
import type { MemoryScopeId } from 'harnesys';
import {
  AgentPromotionStorePort,
  AgentSemanticStorePort,
} from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface DeleteSemanticRequest {
  orgId: string;
  agentId: string;
  id: string;
}

@Injectable()
export class DeleteSemanticUseCase {
  constructor(
    private readonly semantic: AgentSemanticStorePort,
    private readonly promotions: AgentPromotionStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  async execute(request: DeleteSemanticRequest): Promise<void> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    await this.semantic.remove(scope, request.id);
    await this.promotions.deletePendingByFact(request.orgId, scope.agentName, request.id);
  }
}
