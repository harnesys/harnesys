import type {
  GitFileStatus,
  GitFileStatusMap,
  GitSourceSummary,
  GitStatusCounts,
  GitStatusResponse,
} from '@harnesys/studio-shared';
import { countGitFileStatuses } from '@harnesys/studio-shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useActiveOrgStore } from '@/entities/org-machine';
import { type Project, useProjects } from '@/entities/project';
import { deskGitSummaryQuery } from '@/features/desk';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { useStudioLocation } from '@/shared/config/location';

export type GitStatus = Extract<
  GitStatusResponse,
  {
    isGit: true;
  }
>;

export interface GitFileRow {
  path: string;
  status: GitFileStatus;
}

export interface GitFileChanges {
  files: GitFileRow[];
  counts: GitStatusCounts;
  truncated: boolean;
}

export interface GitProjectChanges {
  project: Project;
  files: GitFileRow[];
  counts: GitStatusCounts;
  truncated: boolean;
  branch: string | null;
  head: string | null;
  ahead: number;
  behind: number;
}

export function useOrgGitSummaries(): GitSourceSummary[] | null {
  const { orgId: routeOrgId } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = routeOrgId ?? storeOrgId;
  // Читатель кэша: инициализацией кэша владеет useDeskOrgExtrasSync
  // (один HTTP-фетч при монтировании DeskSync + SSE setQueryData).
  const summaryQuery = useQuery({
    ...deskGitSummaryQuery(orgId ?? ''),
    enabled: false,
  });
  return orgId ? (summaryQuery.data ?? null) : null;
}

function toFileRows(map: GitFileStatusMap): GitFileRow[] {
  return Object.entries(map)
    .filter(([, status]) => status !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// Единый источник изменений: per-source карта file-status, гидратированная при
// старте (useDeskOrgExtrasSync) и обновляемая только SSE. Читается из кэша, без HTTP.
export function useGitFileChanges(projectId: string): GitFileChanges {
  const query = useQuery({
    queryKey: gitFileStatusQueryKey(projectId),
    queryFn: () => getGitFileStatus(projectId),
    enabled: false,
  });
  const map = query.data?.map ?? {};
  return {
    files: toFileRows(map),
    counts: countGitFileStatuses(map),
    truncated: query.data?.truncated ?? false,
  };
}

export function useGitChanges(): GitProjectChanges[] {
  const projects = useProjects().data ?? [];
  const gitProjects = projects.filter((project) => project.hasGit);
  const results = useQueries({
    queries: gitProjects.map((project) => ({
      queryKey: gitFileStatusQueryKey(project.id),
      queryFn: () => getGitFileStatus(project.id),
      enabled: false,
    })),
  });
  const summaries = useOrgGitSummaries() ?? [];
  const bySource = new Map(summaries.map((summary) => [summary.sourceId, summary]));
  const changes: GitProjectChanges[] = [];
  gitProjects.forEach((project, index) => {
    const data = results[index]?.data;
    const map = data?.map ?? {};
    const files = toFileRows(map);
    const truncated = data?.truncated ?? false;
    if (files.length === 0 && !truncated) {
      return;
    }
    const summary = bySource.get(project.id);
    const isGit = summary?.isGit ?? false;
    changes.push({
      project,
      files,
      counts: countGitFileStatuses(map),
      truncated,
      branch: isGit ? (summary?.branch ?? null) : null,
      head: isGit ? (summary?.head ?? null) : null,
      ahead: isGit ? (summary?.ahead ?? 0) : 0,
      behind: isGit ? (summary?.behind ?? 0) : 0,
    });
  });
  return changes;
}
