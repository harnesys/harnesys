import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { GroupChannelMember } from '../../domain/thread/prepare-runtime-input.ts';
import { mentionSlug } from '../../domain/thread/responder-policy.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import type { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface GroupMembersDeps {
  orgId: string;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  participants: ThreadParticipantRepositoryPort;
}

export function groupMembersOf(
  deps: GroupMembersDeps,
  threadId: string,
  selfAgentId: string,
): GroupChannelMember[] | undefined {
  const thread = deps.threads.findById(deps.orgId, threadId);
  if (thread?.kind !== 'group') {
    return undefined;
  }
  const members: GroupChannelMember[] = [];
  const seen = new Set<string>();
  const add = (name: string, isSelf: boolean, handleSource = name): void => {
    const handle = mentionSlug(handleSource);
    if (!handle || seen.has(handle)) {
      return;
    }
    seen.add(handle);
    members.push({ name, handle, isSelf });
  };
  for (const row of deps.threadAgents.listByThread(deps.orgId, threadId)) {
    const name = deps.agents.findById(deps.orgId, row.agentId)?.name ?? row.agentId;
    add(name, row.agentId === selfAgentId);
  }
  for (const participant of deps.participants.listByThread(deps.orgId, threadId)) {
    add(participant.displayName, false, participant.username ?? participant.displayName);
  }
  return members;
}
