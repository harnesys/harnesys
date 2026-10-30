import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { GitCommitDiffView } from '@/features/git-commit';
import { type IdeTab, useIdeStore } from '@/features/ide';
import { agentConnectorsQuery } from '@/features/manage-agent/model/connector-api';
import { BoardSurface } from '@/features/manage-issues';
import { openFileKind } from '@/features/open-file';
import { HitlPrompt } from '@/features/send-message';
import { ApiError, getOrgAgent, getThread } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { ChatComposer } from '@/widgets/chat-composer';
import { SpawnView, ThreadPanel } from '@/widgets/chat-transcript';
import {
  AttachmentPreview,
  attachmentPreviewKind,
  DxfPreview,
  MediaPreview,
  TextEditor,
} from '@/widgets/file-pane';
import { TerminalView } from '@/widgets/terminal-pane';
import { ThreadTriggerDock } from '@/widgets/thread-dock';
import { ThreadJournal } from '@/widgets/thread-journal';
import { ScheduleSurface, WebhookSurface } from './automation-surface';
import { ThreadFileTabContent } from './thread-file-tab';

function ConnectorAwaitingBanner({
  orgId,
  agentId,
  threadId,
}: {
  orgId: string;
  agentId: string;
  threadId: string;
}) {
  const connectorsQuery = useQuery(agentConnectorsQuery(orgId, agentId));
  const awaiting = connectorsQuery.data?.items.some(
    (item) => item.threadId === threadId && item.status === 'awaiting_pair',
  );
  if (!awaiting) {
    return null;
  }
  return (
    <div
      className="shrink-0 border-border/40 border-b px-3 py-1.5 text-muted-foreground text-xs"
      data-testid="connector-awaiting-banner"
    >
      Waiting for Telegram link.
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
    queryFn: () => getThread(threadId),
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
  if (thread.kind === 'chat' || thread.kind === 'connector') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        {thread.kind === 'connector' ? (
          <ConnectorAwaitingBanner orgId={agent.orgId} agentId={agent.id} threadId={thread.id} />
        ) : null}
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} active />
        </div>
        <HitlPrompt />
        <ChatComposer />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
      <ThreadJournal threadId={thread.id} agent={agent} kind={thread.kind} />
      <HitlPrompt />
      <ThreadTriggerDock threadId={thread.id} projectId={tab.projectId} issueId={thread.issueId} />
    </div>
  );
}

function FileTabContent({
  projectId,
  path,
  dirty,
  worktreeId,
}: {
  projectId: string;
  path: string;
  dirty: boolean;
  worktreeId?: string;
}) {
  const kind = openFileKind(path);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
      {kind === 'text' ? (
        <TextEditor projectId={projectId} path={path} dirty={dirty} worktreeId={worktreeId} />
      ) : null}
      {kind === 'image' || kind === 'pdf' || kind === 'docx' || kind === 'xlsx' ? (
        <MediaPreview projectId={projectId} path={path} kind={kind} worktreeId={worktreeId} />
      ) : null}
      {kind === 'dxf' ? (
        <DxfPreview projectId={projectId} path={path} worktreeId={worktreeId} />
      ) : null}
      {kind === 'unsupported' ? (
        <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
          Preview is not available
        </div>
      ) : null}
    </div>
  );
}

export function IdeTabContent({ tab, projectId }: { tab: IdeTab; projectId: string }) {
  const orgId = useOrgId() ?? projectId;
  const isHydrating = useDeskStore((state) => state.hydrated[projectId] !== 'ready');
  if (tab.kind === 'thread' && tab.threadId) {
    return <ThreadTabContent tab={tab} threadId={tab.threadId} isHydrating={isHydrating} />;
  }
  if (tab.kind === 'schedule' && tab.scheduleId) {
    return <ScheduleSurface projectId={projectId} scheduleId={tab.scheduleId} />;
  }
  if (tab.kind === 'webhook' && tab.webhookId) {
    return <WebhookSurface projectId={projectId} webhookId={tab.webhookId} />;
  }
  if (tab.kind === 'board' && tab.boardId) {
    return <BoardSurface projectId={projectId} boardId={tab.boardId} />;
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return <SpawnView tab={tab} threadId={tab.threadId} spawnId={tab.spawnId} />;
  }
  if (tab.kind === 'file' && tab.path) {
    return (
      <FileTabContent
        projectId={projectId}
        path={tab.path}
        dirty={Boolean(tab.dirty)}
        worktreeId={tab.worktreeId}
      />
    );
  }
  if (tab.kind === 'attachment' && tab.issueId && tab.attachmentId && tab.path) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-attachment">
        <AttachmentPreview
          orgId={orgId}
          issueId={tab.issueId}
          attachmentId={tab.attachmentId}
          name={tab.path}
          kind={attachmentPreviewKind(tab.path, tab.mediaType ?? '')}
        />
      </div>
    );
  }
  if (tab.kind === 'thread-file' && tab.threadId && tab.path) {
    return (
      <ThreadFileTabContent
        threadId={tab.threadId}
        path={tab.path}
        attachmentId={tab.attachmentId}
      />
    );
  }
  if (tab.kind === 'diff' && tab.path) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-diff">
        <GitCommitDiffView projectId={projectId} path={tab.path} />
      </div>
    );
  }
  if (tab.kind === 'terminal' && tab.terminalSessionId) {
    return <TerminalView projectId={projectId} sessionId={tab.terminalSessionId} />;
  }
  return null;
}
