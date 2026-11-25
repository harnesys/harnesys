import { InboxIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { Badge } from '@/shared/ui/badge';
import { AgentsSection, AgentsSectionActions } from './agents-section';
import { AutomationsSection, AutomationsSectionActions } from './automations-section';
import { ChannelsSection, ChannelsSectionActions } from './channels-section';
import { DashboardsSection, DashboardsSectionActions } from './dashboards-section';
import { DepartmentCreateButton } from './department-create-button';
import { GitSectionActions, GitTitle } from './git-menu';
import { GitSection } from './git-section';
import { InboxSection } from './inbox-section';
import { IssuesSection, IssuesSectionActions } from './issues-section';
import { ProjectsActions, ProjectsTitle, ProjectsTrees } from './projects-section';
import type { SectionParts } from './section-rail';
import { SECTION_META, type SidebarSectionId } from './sections-meta';
import { TerminalSection, TerminalSectionActions } from './terminal-section';

export interface SectionPartsContext {
  agents: Agent[];
  inboxThreads: Thread[];
  errorThreads: Thread[];
  channels: Thread[];
  projectIds: string[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  activeBoardId: string | null;
  activeTerminalSessionId: string | null;
  deskPending: boolean;
  onSelectDone: () => void;
}

export function sectionParts(id: SidebarSectionId, ctx: SectionPartsContext): SectionParts {
  const Icon = SECTION_META[id].icon;
  const { onSelectDone } = ctx;
  switch (id) {
    case 'inbox':
      return {
        icon: <InboxIcon />,
        title: 'Inbox',
        badge: inboxCountBadge(ctx.errorThreads.length, ctx.inboxThreads.length),
        content: (
          <InboxSection
            threads={[...ctx.errorThreads, ...ctx.inboxThreads]}
            activeThreadId={ctx.activeThreadId}
            onSelectDone={onSelectDone}
          />
        ),
      };
    case 'agents':
      return {
        icon: <Icon />,
        title: 'Agents',
        actions: (
          <>
            <DepartmentCreateButton />
            <AgentsSectionActions onCreated={onSelectDone} />
          </>
        ),
        content: (
          <AgentsSection
            agents={ctx.agents}
            activeAgentId={ctx.activeAgentId}
            activeThreadId={ctx.activeThreadId}
            onSelectDone={onSelectDone}
            loading={ctx.deskPending}
          />
        ),
      };
    case 'channels':
      return {
        icon: <Icon />,
        title: 'Channels',
        actions: <ChannelsSectionActions />,
        content: (
          <ChannelsSection
            channels={ctx.channels}
            activeThreadId={ctx.activeThreadId}
            onSelectDone={onSelectDone}
            loading={ctx.deskPending}
          />
        ),
      };
    case 'projects':
      return {
        icon: <Icon />,
        title: <ProjectsTitle />,
        actions: <ProjectsActions />,
        horizontalScroll: true,
        content: <ProjectsTrees projectIds={ctx.projectIds} />,
      };
    case 'dashboards':
      return {
        icon: <Icon />,
        title: 'Dashboards',
        actions: <DashboardsSectionActions />,
        content: <DashboardsSection onSelectDone={onSelectDone} />,
      };
    case 'issues':
      return {
        icon: <Icon />,
        title: 'Issues',
        actions: <IssuesSectionActions />,
        content: (
          <IssuesSection
            activeBoardId={ctx.activeBoardId}
            onSelectDone={onSelectDone}
            loading={ctx.deskPending}
          />
        ),
      };
    case 'automations':
      return {
        icon: <Icon />,
        title: 'Automations',
        actions: <AutomationsSectionActions agents={ctx.agents} onDone={onSelectDone} />,
        content: <AutomationsSection agents={ctx.agents} onSelectDone={onSelectDone} />,
      };
    case 'git':
      return {
        icon: <Icon />,
        title: <GitTitle />,
        actions: <GitSectionActions />,
        content: <GitSection />,
      };
    case 'terminal':
      return {
        icon: <Icon />,
        title: 'Terminal',
        actions: <TerminalSectionActions onCreated={onSelectDone} />,
        content: (
          <TerminalSection
            activeSessionId={ctx.activeTerminalSessionId}
            onSelectDone={onSelectDone}
          />
        ),
      };
  }
}

function inboxCountBadge(errors: number, waiting: number): ReactNode {
  const badges: ReactNode[] = [];
  if (errors > 0) {
    badges.push(
      <Badge
        key="errors"
        variant="destructive"
        className="h-4 px-1.5 font-normal text-[10px] tabular-nums leading-none"
      >
        {errors}
      </Badge>,
    );
  }
  if (waiting > 0) {
    badges.push(
      <Badge
        key="waiting"
        variant="secondary"
        className="h-4 bg-[var(--color-live)]/15 px-1.5 font-normal text-[10px] text-[var(--color-live)] tabular-nums leading-none"
      >
        {waiting}
      </Badge>,
    );
  }
  return badges.length > 0 ? <span className="flex items-center gap-1">{badges}</span> : null;
}
