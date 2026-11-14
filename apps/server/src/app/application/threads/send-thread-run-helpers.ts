import type { AcceptedRunResponse, SendThreadRunBody } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import type { ThreadKind } from '@harnesys/contracts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { responderModeOf, allowsMentions } from '../../domain/thread/thread-policy.ts';
import { resolveResponders } from '../../domain/thread/responder-policy.ts';
import type { RunStartAttribution } from './run-attribution.ts';
import type { SendThreadMessageUseCase } from './send-thread-message.use-case.ts';

export interface UnaddressedMessageDeps {
  sendMessage: SendThreadMessageUseCase;
  users: UserRepository;
}

/**
 * Responder mode 'mention' with nobody addressed: keep the message in the
 * transcript (and mirrored to transports) without starting a run.
 */
export async function storeUnaddressedMessage(
  deps: UnaddressedMessageDeps,
  request: {
    orgId: string;
    threadId: string;
    body: SendThreadRunBody;
    attribution: RunStartAttribution;
  },
  thread: ThreadRecord,
): Promise<AcceptedRunResponse> {
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
    targetAgentIds: [],
    attribution: request.attribution,
    ...(request.body.origin ? { origin: request.body.origin } : {}),
    ...(request.body.clientEventId ? { clientEventId: request.body.clientEventId } : {}),
    ...(request.body.mode ? { mode: request.body.mode } : {}),
    ...(author ? { author } : {}),
  });
}

/** True when responder mode 'mention' leaves nobody addressed in a chat thread. */
export function chatMentionGateBlocked(
  thread: ThreadRecord,
  agent: AgentRecord,
  body: SendThreadRunBody,
): boolean {
  if (responderModeOf(thread.policy, thread.kind as ThreadKind) !== 'mention') {
    return false;
  }
  const addressed = resolveResponders({
    text: body.text ?? '',
    members: [{ id: agent.id, name: agent.name }],
    autoReplyAgentId: agent.id,
    allowMentions: allowsMentions(thread.policy),
    autoFallback: false,
  });
  return addressed.length === 0;
}
