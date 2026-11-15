import type { ThreadMemberRef, ThreadParticipantRef } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AgentAvatar, AgentRecordAvatar, initialsFromName, useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import {
  addThreadAgent,
  addThreadParticipant,
  removeThreadAgent,
  removeThreadParticipant,
} from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { membersQuery } from '@/shared/api/members';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { mutateThread } from '../model/thread-members-mutation';

function AgentMemberAvatar({ member }: { member: ThreadMemberRef }) {
  const agent = useAgentStore((state) => state.byId(member.id));
  if (agent) {
    return <AgentRecordAvatar agent={agent} title={member.name} size="sm" />;
  }
  return (
    <AgentAvatar
      initials={initialsFromName(member.name)}
      color={null}
      title={member.name}
      size="sm"
    />
  );
}

function ParticipantAvatar({ participant }: { participant: ThreadParticipantRef }) {
  return (
    <UserAvatar
      name={participant.displayName}
      seed={participant.providerUserId}
      title={`${participant.displayName} · ${participant.provider}`}
      size="sm"
    />
  );
}

function MemberChip({
  name,
  avatar,
  onRemove,
}: {
  name: string;
  avatar: ReactNode;
  onRemove(): void;
}) {
  return (
    <span className="group/chip relative flex items-center gap-2 rounded-full bg-muted/50 py-1 pr-2.5 pl-2 text-sm">
      {avatar}
      <span className="max-w-36 truncate">{name}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-muted text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/chip:opacity-100"
        onClick={onRemove}
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </span>
  );
}

function AddMemberChip({ thread }: { thread: Thread }) {
  const orgId = getActiveOrgId();
  const agents = useAgentStore((state) => state.items);
  const users = useQuery({ ...membersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const memberIds = new Set((thread.members ?? []).map((member) => member.id));
  const participantIds = new Set(
    (thread.participants ?? []).map((participant) => participant.providerUserId),
  );
  const availableAgents = agents.filter(
    (agent) => agent.orgId === orgId && !memberIds.has(agent.id),
  );
  const availableUsers = (users.data ?? []).filter((user) => !participantIds.has(user.userId));
  if (availableAgents.length === 0 && availableUsers.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Add member"
            title="Add member"
            className="flex items-center gap-1 rounded-full bg-muted/50 py-1 pr-2.5 pl-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
          />
        }
      >
        <PlusIcon className="size-3.5" />
        Add
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-44">
        {availableAgents.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Agents</DropdownMenuLabel>
            {availableAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => void mutateThread(() => addThreadAgent(thread.id, agent.id))}
              >
                <AgentRecordAvatar agent={agent} size="xs" />
                {agent.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
        {availableUsers.length > 0 ? (
          <DropdownMenuGroup>
            {availableAgents.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>People</DropdownMenuLabel>
            {availableUsers.map((user) => (
              <DropdownMenuItem
                key={user.userId}
                onClick={() =>
                  void mutateThread(() => addThreadParticipant(thread.id, user.userId))
                }
              >
                <UserAvatar name={user.name || user.login} size="xs" />
                {user.name || user.login}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThreadMemberList({ thread }: { thread: Thread }) {
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {members.map((member) => (
        <MemberChip
          key={member.id}
          name={member.name}
          avatar={<AgentMemberAvatar member={member} />}
          onRemove={() => void mutateThread(() => removeThreadAgent(thread.id, member.id))}
        />
      ))}
      {participants.map((participant) => (
        <MemberChip
          key={participant.id}
          name={participant.displayName}
          avatar={<ParticipantAvatar participant={participant} />}
          onRemove={() =>
            void mutateThread(() => removeThreadParticipant(thread.id, participant.id))
          }
        />
      ))}
      <AddMemberChip thread={thread} />
    </div>
  );
}
