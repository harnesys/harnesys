import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { useDeskReady } from '@/features/desk';
import { type IdeTab, useIdeStore } from '@/features/ide';
import { BoardSurface } from '@/features/manage-issues';
import { type FileRef, fileRefKey, fileRefKind, isEditableFileRef } from '@/features/open-file';
import { HitlPrompt } from '@/features/send-message';
import { SourceControlDiffView } from '@/features/source-control';
import { ApiError, getOrgAgent, getThreadSummary } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Spinner } from '@/shared/ui/spinner';
import { ChatComposer } from '@/widgets/chat-composer';
import { SpawnView, ThreadPanel } from '@/widgets/chat-transcript';
import { AddonViewerFrame, FileRefPreview, TextEditor, useAddonViewer } from '@/widgets/file-pane';
import { ThreadDock } from '@/widgets/thread-dock';
import { JournalComposer, ThreadJournal } from '@/widgets/thread-journal';

const DashboardSurface = lazy(() =>
  import('@/features/dashboards/ui/dashboard-surface').then((module) => ({
    default: module.DashboardSurface,
  })),
);
const TerminalView = lazy(() =>
  import('@/widgets/terminal-pane').then((module) => ({ default: module.TerminalView })),
);

function SurfaceFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
      <Spinner className="size-5" />
    </div>
  );
}

function isNotFound(error: Error | null): boolean {
  return error instanceof ApiError && error.status === 404;
}

function useCloseMissingTab(tabId: string, isMissing: boolean): void {
  const { openDesk } = useStudioNavigation();
  useEffect(() => {
    if (!isMissing) {
      return;
    }
    const { workspace, closeTab } = useIdeStore.getState();
    const wasActive = workspace.activeId === tabId;
    closeTab(tabId);
    if (wasActive) {
      openDesk();
    }
  }, [isMissing, openDesk, tabId]);
}

function ThreadTabContent({
  tab,
  threadId,
  isHydrating,
}: {
  tab: IdeTab;
  threadId: string;
  isHydrating: boolean;
}) {
  const orgId = useOrgId() ?? tab.projectId;
  const thread = useThreadStore((state) => state.items.find((item) => item.id === threadId));
  const agentId = thread?.agentId ?? null;
  const agent = useAgentStore((state) =>
    agentId ? state.items.find((item) => item.id === agentId) : undefined,
  );
  const threadQuery = useQuery({
    queryKey: ['thread-detail', threadId],
    queryFn: () => getThreadSummary(threadId),
    enabled: !isHydrating && !thread,
    retry: false,
  });
  const agentQuery = useQuery({
    queryKey: ['thread-agent', agentId],
    queryFn: () => getOrgAgent(orgId, agentId ?? ''),
    enabled: agentId !== null && !agent,
    retry: false,
  });
  const isMissing =
    (!thread && isNotFound(threadQuery.error)) || (!agent && isNotFound(agentQuery.error));
  useCloseMissingTab(tab.id, isMissing);
  useEffect(() => {
    if (threadQuery.data) {
      useThreadStore.getState().upsert(toClientThread(threadQuery.data));
    }
  }, [threadQuery.data]);
  useEffect(() => {
    if (agentQuery.data) {
      useAgentStore.getState().upsert(toClientAgentFromPublic(agentQuery.data));
    }
  }, [agentQuery.data]);
  if (!thread || !agent) {
    if (isMissing) {
      return (
        <div
          className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
          data-testid="ide-thread-missing"
        >
          {thread ? 'Agent not found' : 'Thread not found'}
        </div>
      );
    }
    return (
      <div
        className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
        data-testid="ide-thread-loading"
      >
        Loading…
      </div>
    );
  }
  if (thread.kind === 'chat' || thread.kind === 'group') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} active />
        </div>
        <HitlPrompt />
        <ChatComposer thread={thread} agent={agent} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
      <ThreadJournal threadId={thread.id} agent={agent} kind={thread.kind} />
      <HitlPrompt />
      <JournalComposer thread={thread} agent={agent} />
      <ThreadDock threadId={thread.id} issueId={thread.issueId} />
    </div>
  );
}

function FileTabContent({ target, dirty }: { target: FileRef; dirty: boolean }) {
  const orgId = useOrgId();
  const project = target.source === 'project' ? target : null;
  const viewer = useAddonViewer(orgId, project?.path ?? '');
  if (orgId && project && viewer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
        <AddonViewerFrame
          key={project.path}
          orgId={orgId}
          projectId={project.projectId}
          path={project.path}
          viewer={viewer}
        />
      </div>
    );
  }
  const kind = fileRefKind(target);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
      {kind === 'text' && isEditableFileRef(target) ? (
        <TextEditor key={fileRefKey(target)} target={target} dirty={dirty} />
      ) : (
        <FileRefPreview target={target} kind={kind} />
      )}
    </div>
  );
}

export function IdeTabContent({ tab, projectId }: { tab: IdeTab; projectId: string }) {
  const orgId = useOrgId() ?? projectId;
  const hydrateScope = tab.kind === 'thread' || tab.kind === 'spawn' ? projectId : null;
  const isHydrating = !useDeskReady(hydrateScope);
  if (tab.kind === 'thread' && tab.threadId) {
    return <ThreadTabContent tab={tab} threadId={tab.threadId} isHydrating={isHydrating} />;
  }
  if (tab.kind === 'board' && tab.boardId) {
    return <BoardSurface projectId={projectId} boardId={tab.boardId} />;
  }
  if (tab.kind === 'dashboard' && tab.dashboardId) {
    return (
      <Suspense fallback={<SurfaceFallback />}>
        <DashboardSurface orgId={orgId} dashboardId={tab.dashboardId} />
      </Suspense>
    );
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return <SpawnView tab={tab} threadId={tab.threadId} spawnId={tab.spawnId} />;
  }
  if (tab.kind === 'file' && tab.target) {
    return <FileTabContent target={tab.target} dirty={Boolean(tab.dirty)} />;
  }
  if (tab.kind === 'diff' && tab.path) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-diff">
        <SourceControlDiffView projectId={projectId} path={tab.path} />
      </div>
    );
  }
  if (tab.kind === 'terminal' && tab.terminalSessionId) {
    return (
      <Suspense fallback={<SurfaceFallback />}>
        <TerminalView projectId={projectId} sessionId={tab.terminalSessionId} />
      </Suspense>
    );
  }
  return null;
}
