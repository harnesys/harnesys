import { Injectable } from '@harnesys/brix';
import type { PinRecord } from '@harnesys/contracts';
import type { MemoryScopeId } from 'harnesys';
import { AgentPinStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface ListPinsRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListPinsUseCase {
  constructor(
    private readonly pins: AgentPinStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: ListPinsRequest): Promise<PinRecord[]> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    return this.pins.list(scope);
  }
}
