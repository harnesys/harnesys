import { AtSignIcon } from 'lucide-react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { AgentAvatar, AgentRecordAvatar, initialsFromName, useAgentStore } from '@/entities/agent';
import { type Thread, useThreadStore } from '@/entities/thread';
import { useFileLinkComponents } from '@/features/ide';
import { markMentions, mentionHandle, mentionSlugOf } from '@/shared/lib/markdown-mentions';
import { cn } from '@/shared/lib/utils';
import { Markdown } from '@/shared/ui/markdown';
import { UserAvatar } from '@/shared/ui/user-avatar';

interface MentionMember {
  handle: string;
  name: string;
  agentId?: string;
  userId?: string;
  seed?: string;
}

function membersOf(thread: Thread | undefined): MentionMember[] {
  if (!thread) {
    return [];
  }
  const agents = (thread.members ?? []).map((member) => ({
    handle: mentionHandle(member.name),
    name: member.name,
    agentId: member.id,
    seed: member.id,
  }));
  const users = (thread.participants ?? []).map((participant) => ({
    handle: mentionHandle(participant.username ?? participant.displayName),
    name: participant.displayName,
    userId: participant.id,
    seed: participant.providerUserId,
  }));
  return [...agents, ...users];
}

type AnchorProps = ComponentProps<'a'> & { node?: unknown };

export function useThreadMarkdownComponents(threadId?: string): Components {
  const fileLink = useFileLinkComponents();
  const thread = useThreadStore((state) => (threadId ? state.byId(threadId) : undefined));
  const agents = useAgentStore((state) => state.items);
  const FileLinkAnchor = fileLink.a as ComponentType<AnchorProps> | undefined;
  const members = membersOf(thread);
  return {
    a: (props) => {
      const slug = mentionSlugOf(props.href);
      if (!slug) {
        return FileLinkAnchor ? (
          <FileLinkAnchor {...props} />
        ) : (
          <a href={props.href}>{props.children}</a>
        );
      }
      const member = members.find((item) => item.handle === slug);
      if (member?.agentId) {
        const agent = agents.find((item) => item.id === member.agentId);
        return (
          <MentionBadge
            label={member.name}
            avatar={
              agent ? (
                <AgentRecordAvatar agent={agent} size="xs" className="size-3.5 text-[7px]" />
              ) : (
                <AgentAvatar
                  initials={initialsFromName(member.name)}
                  color={null}
                  size="xs"
                  title={member.name}
                  className="size-3.5 text-[7px]"
                />
              )
            }
          />
        );
      }
      if (member) {
        return (
          <MentionBadge
            label={member.name}
            avatar={
              <UserAvatar
                name={member.name}
                seed={member.seed}
                size="xs"
                className="size-3.5 text-[7px]"
              />
            }
          />
        );
      }
      return <MentionBadge label={slug} />;
    },
  };
}

export function ThreadMarkdown({
  text,
  threadId,
  streaming,
}: {
  text: string;
  threadId?: string;
  streaming?: boolean;
}) {
  const components = useThreadMarkdownComponents(threadId);
  const group = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.kind === 'group' : false,
  );
  return (
    <Markdown
      text={group ? markMentions(text) : text}
      streaming={streaming}
      components={components}
    />
  );
}

export function MentionBadge({
  label,
  avatar,
  className,
}: {
  label: string;
  avatar?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary px-1 py-px align-baseline font-medium text-[0.85em] text-secondary-foreground leading-tight',
        className,
      )}
    >
      {avatar ?? <AtSignIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="truncate">{label}</span>
    </span>
  );
}
