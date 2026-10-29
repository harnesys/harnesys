import { useQuery } from '@tanstack/react-query';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  listRepositoryWorktrees,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { FolderTypeIcon } from '@/shared/ui/icons';
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
        className="flex items-center gap-1.5 py-1 text-muted-foreground"
        style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
      >
        <Spinner className="size-3" />
        <span className="text-xs">Loading branches…</span>
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
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={open}
        className="group/ws relative flex items-center rounded-md hover:bg-sidebar-accent/70"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          toggle();
        }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-live/70"
          style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
          onClick={toggle}
          title={`${sourceName} · ${label}`}
        >
          <span className="flex size-[18px] shrink-0 items-center justify-center">
            {open ? <FolderTypeIcon open size="sm" /> : <FolderTypeIcon size="sm" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sidebar-foreground text-xs">{label}</span>
        </button>
      </div>
      {open ? <ExplorerContent projectId={projectId} depthOffset={depthOffset + 1} /> : null}
    </div>
  );
}
