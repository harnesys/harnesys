import { Injectable } from '@harnesys/brix';
import type { AddThreadAgentBody, ThreadSummary } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { assertUniqueMentionNames } from '../connectors/mention-names.ts';
import { syncConnectorAgentsForThread } from '../connectors/sync-connector-agents.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface AddThreadAgentRequest {
  orgId: string;
  threadId: string;
  body: AddThreadAgentBody;
}

@Injectable()
export class AddThreadAgentUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly connectors: ConnectorRepositoryPort,
  ) {}

  execute(request: AddThreadAgentRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (thread.kind === 'chat') {
      throw new ThreadValidationException(
        'a chat thread has exactly one agent; create a group thread instead',
      );
    }
    if (!this.agents.findById(request.orgId, request.body.agentId)) {
      throw new AgentNotFoundException(request.body.agentId);
    }
    this.threadAgents.ensure(request.orgId, thread.id, request.body.agentId);
    if (!thread.autoReplyAgentId) {
      this.threads.patch(request.orgId, thread.id, { autoReplyAgentId: request.body.agentId });
    }
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    const members = membersOf(deps, request.orgId, thread.id);
    if (this.connectors.listBindingsByThread(request.orgId, thread.id).length > 0) {
      assertUniqueMentionNames(members);
      syncConnectorAgentsForThread(
        { connectors: this.connectors, threadAgents: this.threadAgents },
        request.orgId,
        thread.id,
      );
    }
    return toThreadSummary({
      thread: this.threads.findById(request.orgId, thread.id) ?? thread,
      members,
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
