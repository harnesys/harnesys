import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import type { BridgedProject } from '@/shared/api/projects';
import {
  listRepositoryWorktrees,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { SIDEBAR_ROW_INDENT, SidebarRow } from '@/shared/ui/sidebar-row';
import { Spinner } from '@/shared/ui/spinner';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useOrgGitSummaries } from '../model/use-git-changes';
import { useWorktreesHidden } from '../model/worktrees-visibility.store';
import { BranchFolderLabel } from './branch-folder-label';
import { ACTIVE_BRANCH_KEY } from './branch-keys';
import { ExplorerContent } from './explorer-content';
import { AddRemoteDialog } from './project-root-add-remote-dialog';
import { ProjectRootMenuItems } from './project-root-menu';
import { WorktreeSection } from './worktree-section';

export function SourceBranches({
  projectId,
  project,
  sourceName,
  hasGit,
  depthOffset = 1,
}: {
  projectId: string;
  project?: BridgedProject;
  sourceName: string;
  hasGit: boolean;
  depthOffset?: number;
}) {
  const orgId = getActiveOrgId() ?? '';
  const hidden = useWorktreesHidden(projectId);
  const { data, isPending } = useQuery({
    queryKey: repositoryWorktreesQueryKey(orgId, projectId),
    queryFn: () => listRepositoryWorktrees(orgId, projectId),
    enabled: Boolean(orgId && hasGit && !hidden),
    staleTime: 15000,
  });
  const summaries = useOrgGitSummaries();
  const activeBranch =
    summaries?.find((row) => row.sourceId === projectId && row.isGit)?.branch ?? null;
  const ready = (data?.worktrees ?? []).filter((row) => row.state === 'ready');
  if (!hasGit || hidden || (ready.length === 0 && !isPending)) {
    return <ExplorerContent projectId={projectId} depthOffset={depthOffset} />;
  }
  if (isPending) {
    return (
      <div
        className="flex h-7 items-center gap-1.5 text-muted-foreground"
        style={{ paddingLeft: `${depthOffset * SIDEBAR_ROW_INDENT + 22}px` }}
      >
        <Spinner className="size-4" />
        <span className="text-[11px]">Loading branches...</span>
      </div>
    );
  }
  return (
    <>
      <ActiveBranchFolder
        project={project}
        projectId={projectId}
        sourceName={sourceName}
        label={`${activeBranch ?? 'HEAD'} (active)`}
        depthOffset={depthOffset}
      />
      {ready.map((worktree) => (
        <WorktreeSection
          key={worktree.id}
          projectId={projectId}
          orgId={orgId}
          sourceName={sourceName}
          worktree={worktree}
          depthOffset={depthOffset}
        />
      ))}
    </>
  );
}

function ActiveBranchFolder({
  project,
  projectId,
  sourceName,
  label,
  depthOffset,
}: {
  project?: BridgedProject;
  projectId: string;
  sourceName: string;
  label: string;
  depthOffset: number;
}) {
  const open = useExplorerExpandStore((s) =>
    Boolean(s.branches[projectId]?.includes(ACTIVE_BRANCH_KEY)),
  );
  const toggleBranch = useExplorerExpandStore((s) => s.toggleBranch);
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const toggle = () => {
    toggleBranch(projectId, ACTIVE_BRANCH_KEY);
  };
  return (
    <div data-testid={`explorer-branch-active-${projectId}`}>
      <ContextMenu>
        <ContextMenuTrigger className="block">
          <SidebarRow
            depth={depthOffset}
            aria-expanded={open}
            title={`${sourceName} · ${label}`}
            onClick={toggle}
          >
            <BranchFolderLabel open={open} label={label} titleClassName="text-sidebar-foreground" />
          </SidebarRow>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(event) => event.stopPropagation()}>
          <ProjectRootMenuItems
            projectId={projectId}
            dirPath=""
            project={project}
            onAddRemote={() => {
              setAddRemoteOpen(true);
            }}
          />
        </ContextMenuContent>
      </ContextMenu>
      <AddRemoteDialog
        projectId={projectId}
        open={addRemoteOpen}
        onClose={() => {
          setAddRemoteOpen(false);
        }}
      />
      {open ? <ExplorerContent projectId={projectId} depthOffset={depthOffset + 1} /> : null}
    </div>
  );
}
