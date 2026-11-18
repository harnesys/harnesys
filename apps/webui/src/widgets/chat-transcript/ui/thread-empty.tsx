import { MessagesSquareIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { useAgentThreads } from '@/features/desk';
import { useOpenThreadTab } from '@/features/ide';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import {
  CategoryLanding,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSectionLabel,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { AgentBulletList } from './agent-bullet-list';

const MAX_RECENT_THREADS = 3;
const ASSISTANT_DESCRIPTION =
  'Ask me anything about Harnesys. I can walk you through agents, projects, automations and settings, and help you set things up.';
const ASSISTANT_STARTERS = [
  'Show me around. What can I do in Harnesys?',
  'Create a project and connect a repository.',
  'Set up my first agent and a daily automation.',
];

export function ThreadEmpty({
  agent,
  threadId,
  assistant = false,
}: {
  agent: Agent;
  threadId: string;
  assistant?: boolean;
}) {
  const timeZone = useOrgTimeZone();
  const openThreadTab = useOpenThreadTab();
  const recentThreads = useAgentThreads(agent.id)
    .filter((thread) => thread.id !== threadId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RECENT_THREADS);
  if (assistant) {
    return (
      <CategoryLanding data-testid="chat-empty-thread" className="fade-in animate-in duration-200">
        <CategoryLandingEyebrow>ASSISTANT</CategoryLandingEyebrow>
        <CategoryLandingTitle>{agent.name} can help with anything</CategoryLandingTitle>
        <CategoryLandingDescription>{ASSISTANT_DESCRIPTION}</CategoryLandingDescription>
        <div className="mt-8">
          <AgentBulletList
            key={agent.id}
            agent={agent}
            threadId={threadId}
            starters={ASSISTANT_STARTERS}
            editable={false}
          />
        </div>
      </CategoryLanding>
    );
  }
  return (
    <CategoryLanding data-testid="chat-empty-thread" className="fade-in animate-in duration-200">
      <CategoryLandingEyebrow>READY</CategoryLandingEyebrow>
      <CategoryLandingTitle>{agent.name} is on the floor</CategoryLandingTitle>
      <CategoryLandingDescription>{agent.instructions}</CategoryLandingDescription>
      <div className="mt-8 grid items-start gap-x-8 gap-y-7 md:grid-cols-2">
        <AgentBulletList key={agent.id} agent={agent} threadId={threadId} />
        {recentThreads.length > 0 ? (
          <section>
            <CategoryLandingSectionLabel icon={<MessagesSquareIcon />}>
              Recent threads
            </CategoryLandingSectionLabel>
            <CategoryLandingList>
              {recentThreads.map((thread) => (
                <CategoryLandingListItem
                  key={thread.id}
                  icon={<MessagesSquareIcon />}
                  title={thread.title}
                  subtitle={formatDayTime(thread.updatedAt, timeZone)}
                  onClick={() => {
                    openThreadTab(agent.orgId, agent.id, thread.id);
                  }}
                />
              ))}
            </CategoryLandingList>
          </section>
        ) : null}
      </div>
    </CategoryLanding>
  );
}
