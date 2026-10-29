import { Injectable } from '@harnesys/brix';
import type { AgentPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { requireAgent, toAgentPublic } from './agent.helpers.ts';

export interface GetAgentRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class GetAgentUseCase {
  constructor(private readonly agents: AgentRegistryPort) {}

  execute(request: GetAgentRequest): AgentPublic {
    return toAgentPublic(requireAgent(this.agents, request.orgId, request.agentId));
  }
}
