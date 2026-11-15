import type { ThreadMemberRef, ThreadParticipantRef } from '@harnesys/studio-shared';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AgentAvatar, AgentRecordAvatar, initialsFromName, useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { removeThreadAgent, removeThreadParticipant } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { mutateThread } from '../model/thread-members-mutation';

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

export function ThreadMemberList({ thread }: { thread: Thread }) {
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  return (
    <div>
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
    </div>
  );
}
