import { EntityNotFoundException, Injectable } from '@harnesys/brix';
import { AgentPromotionStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import type {
  PromotionDecisionRequest,
  PromotionDecisionResult,
} from './approve-promotion.use-case.ts';

@Injectable()
export class RejectPromotionUseCase {
  constructor(
    private readonly promotions: AgentPromotionStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  async execute(request: PromotionDecisionRequest): Promise<PromotionDecisionResult> {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const pending = await this.promotions.pending(request.orgId, agent.name);
    const record = pending.find((row) => row.id === request.promotionId);
    if (record === undefined) {
      throw new EntityNotFoundException('Memory promotion not found or already decided', {
        promotionId: request.promotionId,
      });
    }
    await this.promotions.setStatus(
      request.orgId,
      record.id,
      'rejected',
      new Date().toISOString(),
      'user',
    );
    return { id: record.id, status: 'rejected' };
  }
}
