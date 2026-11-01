import type {
  GitFileStatus,
  GitSourceSummary,
  GitStatusCounts,
  GitStatusResponse,
  GitSummaryCounts,
} from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useActiveOrgStore } from '@/entities/org-machine';
import { type Project, useProjects } from '@/entities/project';
import { deskGitSummaryQuery, useDeskReady } from '@/features/desk';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { useStudioLocation } from '@/shared/config/location';

export type GitStatus = Extract<
  GitStatusResponse,
  {
    isGit: true;
  }
>;

export interface GitProjectChanges {
  project: Project;
  status: GitStatus | null;
  truncated: boolean;
}

export interface GitFileRow {
  path: string;
  status: GitFileStatus;
}

function toStatusCounts(counts: GitSummaryCounts | undefined): GitStatusCounts | undefined {
  if (!counts) {
    return undefined;
  }
  return {
    added: 0,
    modified: counts.modified,
    deleted: 0,
    untracked: counts.untracked,
    staged: counts.staged,
    conflicted: counts.conflicted,
    renamed: 0,
  };
}

function toGitStatus(summary: GitSourceSummary): GitStatus | null {
  if (!summary.isGit) {
    return null;
  }
  const dirtyCount = summary.dirtyCount ?? 0;
  return {
    isGit: true,
    branch: summary.branch ?? null,
    detached: false,
    head: summary.head ?? null,
    ahead: summary.ahead ?? 0,
    behind: summary.behind ?? 0,
    dirty: dirtyCount > 0,
    dirtyCount,
    counts: toStatusCounts(summary.counts),
    noCommits: summary.noCommits ?? false,
    truncated: summary.truncated,
  };
}

export function useOrgGitSummaries(): GitSourceSummary[] | null {
  const { orgId: routeOrgId } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = routeOrgId ?? storeOrgId;
  // Observer only: DeskSync hydrates the summary once the desk slices settle.
  const deskReady = useDeskReady(orgId);
  const summaryQuery = useQuery({
    ...deskGitSummaryQuery(orgId ?? ''),
    enabled: Boolean(orgId) && deskReady,
  });
  return orgId ? (summaryQuery.data ?? null) : null;
}

export function useGitChanges(): GitProjectChanges[] {
  const projectQuery = useProjects();
  const projects = projectQuery.data ?? [];
  const summaries = useOrgGitSummaries();
  if (!summaries) {
    return [];
  }
  const bySource = new Map(summaries.map((s) => [s.sourceId, s]));
  const result: GitProjectChanges[] = [];
  for (const project of projects) {
    if (!project.hasGit) {
      continue;
    }
    const summary = bySource.get(project.id);
    if (!summary?.isGit) {
      continue;
    }
    const status = toGitStatus(summary);
    if (!status || (!status.dirty && !status.truncated)) {
      continue;
    }
    result.push({ project, status, truncated: Boolean(summary.truncated) });
  }
  return result;
}

export function useGitFileChanges(projectId: string): GitFileRow[] {
  const { orgId: routeOrgId } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = routeOrgId ?? storeOrgId;
  // Wait for the desk basket: an early fetch hits git before host routing
  // (rememberProjectNode) is known and caches an empty status forever.
  const deskReady = useDeskReady(orgId);
  const query = useQuery({
    queryKey: gitFileStatusQueryKey(projectId),
    queryFn: () => getGitFileStatus(projectId),
    enabled: Boolean(projectId) && Boolean(orgId) && deskReady,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const map = query.data?.map ?? {};
  return Object.entries(map)
    .filter(([, s]) => s !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
