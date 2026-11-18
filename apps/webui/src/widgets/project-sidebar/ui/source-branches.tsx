import { useQuery } from '@tanstack/react-query';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  listRepositoryWorktrees,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { SIDEBAR_ROW_INDENT, SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';
import { Spinner } from '@/shared/ui/spinner';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useOrgGitSummaries } from '../model/use-git-changes';
import { useWorktreesHidden } from '../model/worktrees-visibility.store';
import { ACTIVE_BRANCH_KEY } from './branch-keys';
import { ExplorerContent } from './explorer-content';
import { WorktreeSection } from './worktree-section';

export function SourceBranches({
  projectId,
  sourceName,
  hasGit,
  depthOffset = 1,
}: {
  projectId: string;
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
        <span className="text-[11px]">Loading branches…</span>
      </div>
    );
  }
  return (
    <>
      <ActiveBranchFolder
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
  projectId,
  sourceName,
  label,
  depthOffset,
}: {
  projectId: string;
  sourceName: string;
  label: string;
  depthOffset: number;
}) {
  const open = useExplorerExpandStore((s) =>
    Boolean(s.branches[projectId]?.includes(ACTIVE_BRANCH_KEY)),
  );
  const toggleBranch = useExplorerExpandStore((s) => s.toggleBranch);
  const toggle = () => {
    toggleBranch(projectId, ACTIVE_BRANCH_KEY);
  };
  return (
    <div data-testid={`explorer-branch-active-${projectId}`}>
      <SidebarRow
        depth={depthOffset}
        leading={open ? <FolderTypeIcon open /> : <FolderTypeIcon />}
        aria-expanded={open}
        title={`${sourceName} · ${label}`}
        onClick={toggle}
      >
        <SidebarRowTitle className="text-sidebar-foreground">{label}</SidebarRowTitle>
      </SidebarRow>
      {open ? <ExplorerContent projectId={projectId} depthOffset={depthOffset + 1} /> : null}
    </div>
  );
}
