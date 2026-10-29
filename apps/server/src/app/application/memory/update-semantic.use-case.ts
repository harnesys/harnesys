import { Injectable } from '@harnesys/brix';
import type { MemoryRecord, UpdateSemanticBody } from '@harnesys/contracts';
import type { MemoryScopeId } from 'harnesys';
import { AgentSemanticStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface UpdateSemanticRequest extends UpdateSemanticBody {
  orgId: string;
  agentId: string;
  id: string;
}

@Injectable()
export class UpdateSemanticUseCase {
  constructor(
    private readonly semantic: AgentSemanticStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpdateSemanticRequest): Promise<MemoryRecord> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    return this.semantic.update(scope, { id: request.id, text: request.text });
  }
}
