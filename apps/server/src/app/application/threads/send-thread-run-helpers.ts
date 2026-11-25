import type { AcceptedRunResponse, SendThreadRunBody, ThreadKind } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { resolveResponders } from '../../domain/thread/responder-policy.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { allowsMentions, responderModeOf } from '../../domain/thread/thread-policy.ts';
import type { GetEffectiveSkillsUseCase } from '../skills/get-effective-skills.use-case.ts';
import { validateRequestedSkills } from '../skills/requested-skills.ts';
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
    ...(request.body.quote ? { quote: request.body.quote } : {}),
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

/** Rejects requested skills the thread agent does not actually have. */
export async function assertRequestedSkills(
  effectiveSkills: GetEffectiveSkillsUseCase,
  orgId: string,
  agentId: string,
  requested: string[],
): Promise<void> {
  if (requested.length === 0) {
    return;
  }
  const effective = await effectiveSkills.execute({ orgId, agentId });
  const check = validateRequestedSkills({ requested, catalog: effective.skills });
  if ('error' in check) {
    throw new ThreadValidationException(check.error);
  }
}
