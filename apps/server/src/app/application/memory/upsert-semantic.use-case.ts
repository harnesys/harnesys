import { Injectable } from '@harnesys/brix';
import type { MemoryRecord, UpsertSemanticBody } from '@harnesys/contracts';
import type { MemoryScopeId } from 'harnesys';
import { AgentSemanticStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface UpsertSemanticRequest extends UpsertSemanticBody {
  orgId: string;
  agentId: string;
}

@Injectable()
export class UpsertSemanticUseCase {
  constructor(
    private readonly semantic: AgentSemanticStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpsertSemanticRequest): Promise<MemoryRecord> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, {
      orgId: request.orgId,
      agentId: request.agentId,
      threadId: request.threadId,
    });
    return this.semantic.upsert(scope, {
      scope: request.scope,
      text: request.text,
      key: request.key,
      threadId: request.threadId,
      source: 'human',
    });
  }
}
