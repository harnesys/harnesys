import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useProjects } from '@/entities/project';
import { sourceFilesTreeQueryKey } from '@/shared/api/files';
import {
  getGitStatus,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
  initGit,
  invalidateGitOrgSummary,
} from '@/shared/api/git';
import { projectQueryKey } from '@/shared/api/projects';
import { DropdownMenuGroup, DropdownMenuItem } from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { type GitStatus, useGitChanges, useOrgGitSummaries } from '../model/use-git-changes';
import { GitActiveRepoMenuItems } from './git-active-menu';
import { SectionMenu } from './section-menu';

export function useGitStatus(projectId: string): GitStatus | null {
  const projectQuery = useProjects();
  const project = projectQuery.data?.find((row) => row.id === projectId);
  const query = useQuery({
    queryKey: gitStatusQueryKey(projectId),
    queryFn: () => getGitStatus(projectId),
    enabled: Boolean(projectId) && Boolean(project?.hasGit),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return query.data?.isGit ? (query.data as GitStatus) : null;
}
export function GitTitle() {
  const summaries = useOrgGitSummaries() ?? [];
  let dirtyTotal = 0;
  let aheadTotal = 0;
  let behindTotal = 0;
  for (const summary of summaries) {
    if (!summary.isGit) {
      continue;
    }
    dirtyTotal += summary.dirtyCount ?? 0;
    aheadTotal += summary.ahead ?? 0;
    behindTotal += summary.behind ?? 0;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      Git
      {dirtyTotal > 0 ? (
        <span className="shrink-0 font-normal text-[10px] text-status-warn">• {dirtyTotal}</span>
      ) : null}
      {aheadTotal || behindTotal ? (
        <span className="shrink-0 font-normal text-[10px] text-muted-foreground">
          ↑{aheadTotal} ↓{behindTotal}
        </span>
      ) : null}
    </span>
  );
}
export function GitSectionActions() {
  const changes = useGitChanges();
  if (changes.length !== 1) {
    return null;
  }
  const entry = changes[0];
  return entry ? <GitSectionMenu projectId={entry.project.id} /> : null;
}
export function GitRepoMenuItems({
  projectId,
  includeRemoteRefresh,
  onRemoteRefresh,
  remoteRefreshPending,
}: {
  projectId: string;
  includeRemoteRefresh?: boolean;
  onRemoteRefresh?: () => void;
  remoteRefreshPending?: boolean;
}) {
  const qc = useQueryClient();
  const status = useGitStatus(projectId);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
    void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: projectQueryKey });
    invalidateGitOrgSummary(qc);
  };
  if (!status) {
    return (
      <GitInitMenuItems
        projectId={projectId}
        refresh={refresh}
        includeRemoteRefresh={includeRemoteRefresh}
        onRemoteRefresh={onRemoteRefresh}
        remoteRefreshPending={remoteRefreshPending}
      />
    );
  }
  return (
    <GitActiveRepoMenuItems
      projectId={projectId}
      status={status}
      refresh={refresh}
      includeRemoteRefresh={includeRemoteRefresh}
      onRemoteRefresh={onRemoteRefresh}
      remoteRefreshPending={remoteRefreshPending}
    />
  );
}

function GitInitMenuItems({
  projectId,
  refresh,
  includeRemoteRefresh,
  onRemoteRefresh,
  remoteRefreshPending,
}: {
  projectId: string;
  refresh: () => void;
  includeRemoteRefresh?: boolean;
  onRemoteRefresh?: () => void;
  remoteRefreshPending?: boolean;
}) {
  const handleInit = () => {
    void initGit(projectId)
      .then(() => {
        refresh();
        toast.add({ title: 'Git repository initialized' });
      })
      .catch((error) => {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not initialize git',
        });
      });
  };
  return (
    <DropdownMenuGroup>
      <DropdownMenuItem onClick={handleInit}>
        <PlusIcon className="size-3" />
        Initialize repository
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          if (includeRemoteRefresh && onRemoteRefresh) {
            onRemoteRefresh();
            return;
          }
          refresh();
        }}
        disabled={remoteRefreshPending}
      >
        <RefreshCwIcon className="size-3" />
        Refresh
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

export function GitSectionMenu({ projectId }: { projectId: string }) {
  return (
    <SectionMenu label="Git actions" contentClassName="min-w-52">
      <GitRepoMenuItems projectId={projectId} />
    </SectionMenu>
  );
}
