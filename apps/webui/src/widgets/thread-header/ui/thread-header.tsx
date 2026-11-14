import { UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import {
  AddThreadMemberMenu,
  ThreadMembersPopover,
  ThreadSettings,
} from '@/features/manage-thread-members';
import { useOrgId } from '@/shared/config/location';
import { softTint } from '@/shared/lib/color';
import { IconRef } from '@/shared/ui/icon';
import { PageHeader, PageHeaderIcon } from '@/shared/ui/page-header';
import { type ThreadTrigger, useThreadTrigger } from '../model/use-thread-trigger';

export function ThreadHeader({ thread, agent }: { thread: Thread; agent: Agent }) {
  const orgId = useOrgId() ?? thread.orgId ?? '';
  const trigger = useThreadTrigger(thread.id, orgId);
  const isGroup = thread.kind === 'group';
  return (
    <PageHeader
      icon={threadIcon(thread, agent, trigger)}
      title={thread.title || (isGroup ? 'Group thread' : 'Thread')}
      subtitle={threadSubtitle(thread, agent, trigger)}
      actions={
        <>
          {isGroup ? <ThreadMembersPopover thread={thread} /> : null}
          {isGroup ? <AddThreadMemberMenu thread={thread} /> : null}
          <ThreadSettings thread={thread} />
        </>
      }
    />
  );
}

function threadIcon(thread: Thread, agent: Agent, trigger: ThreadTrigger | null): ReactNode {
  if (thread.kind === 'group') {
    return (
      <PageHeaderIcon>
        <UsersIcon className="size-4" />
      </PageHeaderIcon>
    );
  }
  if (trigger) {
    return <TriggerIcon trigger={trigger} />;
  }
  return <AgentRecordAvatar agent={agent} size="md" title={agent.name} />;
}

function TriggerIcon({ trigger }: { trigger: ThreadTrigger }) {
  const color = trigger.kind?.color ?? '';
  return (
    <PageHeaderIcon style={color ? { backgroundColor: softTint(color), color } : undefined}>
      <IconRef icon={trigger.kind?.icon || 'zap'} className="size-4" />
    </PageHeaderIcon>
  );
}

function threadSubtitle(thread: Thread, agent: Agent, trigger: ThreadTrigger | null): ReactNode {
  if (thread.kind === 'group') {
    return (
      <span className="flex items-center gap-1.5">
        <UsersIcon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{memberSummary(thread)}</span>
      </span>
    );
  }
  if (trigger) {
    return trigger.kind?.label ?? trigger.automation.kind;
  }
  return agent.name;
}

function memberSummary(thread: Thread): string {
  const agents = thread.members?.length ?? 0;
  const people = thread.participants?.length ?? 0;
  const parts: string[] = [];
  if (agents > 0) {
    parts.push(`${agents} ${agents === 1 ? 'agent' : 'agents'}`);
  }
  if (people > 0) {
    parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No members yet';
}
