import type { MemoryScopeId } from 'harnesys';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';

export interface AgentMemoryScopeRequest {
  orgId: string;
  agentId: string;
  threadId?: string;
}

export function agentMemoryScope(
  agents: AgentRegistryPort,
  request: AgentMemoryScopeRequest,
): MemoryScopeId {
  const agent: AgentRecord | undefined = agents.findById(request.orgId, request.agentId);
  if (!agent) {
    throw new AgentNotFoundException(request.agentId);
  }
  return {
    orgId: request.orgId,
    agentName: agent.name,
    ...(request.threadId ? { threadId: request.threadId } : {}),
  };
}
