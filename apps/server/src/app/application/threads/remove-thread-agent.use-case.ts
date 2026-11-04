import { Injectable } from '@harnesys/brix';
import type { ThreadSummary } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { syncConnectorAgentsForThread } from '../connectors/sync-connector-agents.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface RemoveThreadAgentRequest {
  orgId: string;
  threadId: string;
  agentId: string;
}

@Injectable()
export class RemoveThreadAgentUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly connectors: ConnectorRepositoryPort,
  ) {}

  execute(request: RemoveThreadAgentRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (thread.kind === 'chat') {
      throw new ThreadValidationException(
        'a chat thread has exactly one agent; delete the thread instead',
      );
    }
    const members = this.threadAgents.listByThread(request.orgId, thread.id);
    const remaining = members.filter((row) => row.agentId !== request.agentId);
    if (remaining.length === members.length) {
      throw new ThreadNotFoundException(`${thread.id}:${request.agentId}`);
    }
    if (remaining.length === 0) {
      throw new ThreadValidationException(
        'a thread must keep at least one agent; delete the thread instead',
      );
    }
    if (thread.autoReplyAgentId === request.agentId) {
      const nextAutoReply = remaining[0];
      if (nextAutoReply) {
        this.threads.patch(request.orgId, thread.id, {
          autoReplyAgentId: nextAutoReply.agentId,
        });
      }
    }
    this.threadAgents.remove(request.orgId, thread.id, request.agentId);
    if (this.connectors.listBindingsByThread(request.orgId, thread.id).length > 0) {
      syncConnectorAgentsForThread(
        { connectors: this.connectors, threadAgents: this.threadAgents },
        request.orgId,
        thread.id,
      );
    }
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread: this.threads.findById(request.orgId, thread.id) ?? thread,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
