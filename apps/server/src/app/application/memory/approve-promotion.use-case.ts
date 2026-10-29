import { EntityNotFoundException, Injectable } from '@harnesys/brix';
import { promotionEntryOf } from 'harnesys';
import type { PromotionFactRow } from '../../domain/agent/agent-memory.port.ts';
import { AgentPromotionStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { requireAgent } from '../agents/agent.helpers.ts';

export interface PromotionDecisionRequest {
  orgId: string;
  agentId: string;
  promotionId: string;
}

export interface PromotionDecisionResult {
  id: string;
  status: 'approved' | 'rejected';
}

@Injectable()
export class ApprovePromotionUseCase {
  constructor(
    private readonly promotions: AgentPromotionStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  async execute(request: PromotionDecisionRequest): Promise<PromotionDecisionResult> {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const record = await this.pendingRecordOf(request, agent.name);
    const block = promotionEntryOf({
      id: record.id,
      date: new Date().toISOString().slice(0, 10),
      text: record.text,
    });
    await this.promotions.appendInstructionBlock(request.orgId, agent.name, block);
    await this.promotions.setStatus(
      request.orgId,
      record.id,
      'approved',
      new Date().toISOString(),
      'user',
    );
    return { id: record.id, status: 'approved' };
  }

  private async pendingRecordOf(
    request: PromotionDecisionRequest,
    agentName: string,
  ): Promise<PromotionFactRow> {
    const pending = await this.promotions.pending(request.orgId, agentName);
    const record = pending.find((row) => row.id === request.promotionId);
    if (record === undefined) {
      throw new EntityNotFoundException('Memory promotion not found or already decided', {
        promotionId: request.promotionId,
      });
    }
    return record;
  }
}
