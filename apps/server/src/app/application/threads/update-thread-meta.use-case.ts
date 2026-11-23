import { Injectable } from '@harnesys/brix';
import type { ThreadSummary, UpdateThreadMetaBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface UpdateThreadMetaRequest {
  orgId: string;
  threadId: string;
  body: UpdateThreadMetaBody;
}

function applyMetadataUpdate(
  current: Record<string, unknown>,
  body: UpdateThreadMetaBody,
): Record<string, unknown> {
  const metadata = { ...current };
  if (body.icon !== undefined) {
    if (body.icon === null) {
      delete metadata.icon;
    } else {
      metadata.icon = body.icon;
    }
  }
  if (body.color !== undefined) {
    if (body.color === null) {
      delete metadata.color;
    } else {
      metadata.color = body.color;
    }
  }
  return metadata;
}

@Injectable()
export class UpdateThreadMetaUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpdateThreadMetaRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const { title } = request.body;
    const touchesMeta = request.body.icon !== undefined || request.body.color !== undefined;
    const updated = this.threads.patch(request.orgId, thread.id, {
      ...(title !== undefined ? { title } : {}),
      ...(touchesMeta ? { metadata: applyMetadataUpdate(thread.metadata, request.body) } : {}),
    });
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread: updated,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadHasRuns(request.orgId, thread.id),
    });
  }
}
