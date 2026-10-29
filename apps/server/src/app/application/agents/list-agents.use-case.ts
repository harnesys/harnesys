import { Injectable } from '@harnesys/brix';
import type { ListAgentsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { toAgentPublic } from './agent.helpers.ts';

export interface ListAgentsRequest {
  orgId: string;
}

@Injectable()
export class ListAgentsUseCase {
  constructor(private readonly agents: AgentRegistryPort) {}

  execute(request: ListAgentsRequest): ListAgentsResponse {
    const items = this.agents.list(request.orgId).map(toAgentPublic);
    return { items };
  }
}
