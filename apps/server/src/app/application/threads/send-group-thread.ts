import type { AcceptedRunResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { resolveResponders } from '../../domain/thread/responder-policy.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { allowsMentions, responderModeOf } from '../../domain/thread/thread-policy.ts';
import { resolveAttachmentsOf } from './send-thread-attachments.ts';
import { SendThreadMessageUseCase } from './send-thread-message.use-case.ts';
import type { SendThreadRunRequest } from './send-thread-run.use-case.ts';

export interface GroupSendDeps {
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  attachments: AttachmentRepositoryPort;
  users: UserRepository;
  layout: HostFsLayoutPort;
  sendMessage: SendThreadMessageUseCase;
}

export async function sendGroupThread(
  deps: GroupSendDeps,
  request: SendThreadRunRequest,
  thread: ThreadRecord,
): Promise<AcceptedRunResponse> {
  const members = deps.threadAgents.listByThread(request.orgId, thread.id).map((row) => ({
    id: row.agentId,
    name: deps.agents.findById(request.orgId, row.agentId)?.name ?? row.agentId,
  }));
  const responders = resolveResponders({
    text: request.body.text ?? '',
    explicitAgentId: request.body.agentId ?? null,
    members,
    autoReplyAgentId: thread.autoReplyAgentId,
    allowMentions: allowsMentions(thread.policy),
    autoFallback: responderModeOf(thread.policy, thread.kind) === 'auto',
  });
  const attachments = resolveAttachmentsOf(
    deps.attachments,
    request.orgId,
    thread.id,
    request.body.attachmentIds,
    deps.layout.threadDir(request.orgId, thread.id),
  );
  const actorId = request.attribution.startedByUserId;
  const author = actorId
    ? {
        provider: 'app',
        providerUserId: actorId,
        displayName: deps.users.findById(actorId)?.name ?? actorId,
      }
    : undefined;
  return await deps.sendMessage.execute({
    orgId: request.orgId,
    threadId: thread.id,
    text: request.body.text ?? '',
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(request.body.origin ? { origin: request.body.origin } : {}),
    ...(request.body.clientEventId ? { clientEventId: request.body.clientEventId } : {}),
    ...(request.body.mode ? { mode: request.body.mode } : {}),
    ...(request.body.quote ? { quote: request.body.quote } : {}),
    ...(author ? { author } : {}),
    targetAgentIds: responders,
    attribution: request.attribution,
    triggerId: request.trigger?.id ?? thread.id,
  });
}
