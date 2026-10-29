import { Injectable } from '@harnesys/brix';
import type { MemoryScopeId } from 'harnesys';
import { AgentPinStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface DeletePinRequest {
  orgId: string;
  agentId: string;
  key: string;
}

@Injectable()
export class DeletePinUseCase {
  constructor(
    private readonly pins: AgentPinStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: DeletePinRequest): Promise<void> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    return this.pins.remove(scope, request.key);
  }
}
