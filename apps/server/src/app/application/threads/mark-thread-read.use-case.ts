import { Injectable } from '@harnesys/brix';
import type { ThreadPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { toThreadPublic } from './thread.helpers.ts';

export interface MarkThreadReadRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class MarkThreadReadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: MarkThreadReadRequest): Promise<ThreadPublic> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const read = this.threads.markRead(request.orgId, request.threadId, new Date().toISOString());
    const agent = this.agents.findById(request.orgId, read.agentId);
    const active = this.threads.findActiveRun(request.orgId, read.id);
    return toThreadPublic({
      thread: read,
      agentName: agent?.name ?? '',
      active: active ?? null,
      events: [],
      inheritedEventCount: 0,
      waitingForProfileId: undefined,
      names: runAttributionNamesOf(this.users, this.nodes, request.orgId),
    });
  }
}
