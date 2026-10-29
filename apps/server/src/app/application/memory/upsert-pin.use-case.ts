import { Injectable } from '@harnesys/brix';
import type { PinRecord, UpsertPinBody } from '@harnesys/contracts';
import type { MemoryScopeId, PinSource } from 'harnesys';
import { AgentPinStorePort } from '../../domain/agent/agent-memory.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { agentMemoryScope } from './agent-memory-scope.ts';

export interface UpsertPinRequest extends UpsertPinBody {
  orgId: string;
  agentId: string;
  key: string;
  source?: PinSource;
}

@Injectable()
export class UpsertPinUseCase {
  constructor(
    private readonly pins: AgentPinStorePort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpsertPinRequest): Promise<PinRecord> {
    const scope: MemoryScopeId = agentMemoryScope(this.agents, request);
    return this.pins.upsert(scope, {
      key: request.key,
      text: request.text,
      source: request.source ?? 'human',
    });
  }
}
