import type { ThreadMemberRef, ThreadParticipantRef } from '@harnesys/studio-shared';
import { UsersIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AgentAvatar, AgentRecordAvatar, initialsFromName, useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { removeThreadAgent, removeThreadParticipant } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { mutateThread } from '../model/thread-members-mutation';

const MAX_STACK = 5;

function AgentMemberAvatar({
  member,
  size = 'sm',
}: {
  member: ThreadMemberRef;
  size?: 'xs' | 'sm' | 'md';
}) {
  const agent = useAgentStore((state) => state.byId(member.id));
  if (agent) {
    return (
      <AgentRecordAvatar
        agent={agent}
        title={member.name}
        size={size}
        className="ring-2 ring-background"
      />
    );
  }
  return (
    <AgentAvatar
      initials={initialsFromName(member.name)}
      color={null}
      title={member.name}
      size={size}
      className="ring-2 ring-background"
    />
  );
}

function ParticipantAvatar({
  participant,
  size = 'sm',
}: {
  participant: ThreadParticipantRef;
  size?: 'xs' | 'sm' | 'md';
}) {
  return (
    <UserAvatar
      name={participant.displayName}
      seed={participant.providerUserId}
      title={`${participant.displayName} · ${participant.provider}`}
      size={size}
      className="ring-2 ring-background"
    />
  );
}

export function ThreadMemberAvatarStack({ thread }: { thread: Thread }) {
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  const agents = members.slice(0, MAX_STACK);
  const users = participants.slice(0, Math.max(0, MAX_STACK - agents.length));
  const overflow = members.length + participants.length - agents.length - users.length;
  if (agents.length === 0 && users.length === 0) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background">
        <UsersIcon className="size-3" />
      </span>
    );
  }
  return (
    <span className="flex items-center -space-x-1.5" data-testid="group-avatar-stack">
      {agents.map((member) => (
        <AgentMemberAvatar key={member.id} member={member} size="md" />
      ))}
      {users.map((participant) => (
        <ParticipantAvatar key={participant.id} participant={participant} size="md" />
      ))}
      {overflow > 0 ? (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-[8px] text-muted-foreground ring-2 ring-background">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function MemberRow({
  name,
  avatar,
  onRemove,
}: {
  name: string;
  avatar: ReactNode;
  onRemove(): void;
}) {
  return (
    <div className="group/member flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50">
      {avatar}
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${name}`}
        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/member:opacity-100"
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  );
}

export function ThreadMembersPopover({ thread }: { thread: Thread }) {
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Group members"
        title="Group members"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ThreadMemberAvatarStack thread={thread} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Agents
        </p>
        {members.length === 0 ? (
          <p className="px-1.5 pb-1 text-muted-foreground text-xs">No agents yet</p>
        ) : (
          members.map((member) => (
            <MemberRow
              key={member.id}
              name={member.name}
              avatar={<AgentMemberAvatar member={member} />}
              onRemove={() => void mutateThread(() => removeThreadAgent(thread.id, member.id))}
            />
          ))
        )}
        <p className="mt-2 px-1.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          People
        </p>
        {participants.length === 0 ? (
          <p className="px-1.5 text-muted-foreground text-xs">No people yet</p>
        ) : (
          participants.map((participant) => (
            <MemberRow
              key={participant.id}
              name={participant.displayName}
              avatar={<ParticipantAvatar participant={participant} />}
              onRemove={() =>
                void mutateThread(() => removeThreadParticipant(thread.id, participant.id))
              }
            />
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
