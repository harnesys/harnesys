import { Injectable } from '@harnesys/brix';
import type { PromotionFactRow } from '../../domain/agent/agent-memory.port.ts';
import { AgentPromotionStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface ListPromotionsRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListPromotionsUseCase {
  constructor(
    private readonly promotions: AgentPromotionStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: ListPromotionsRequest): Promise<PromotionFactRow[]> {
    const scope = agentMemoryScope(this.agents, request);
    return this.promotions.pending(scope.orgId, scope.agentName);
  }
}
