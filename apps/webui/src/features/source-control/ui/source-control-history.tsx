import type { GitCommitDetail, GitCommitSummary } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { getGitLog, getGitShow, gitLogQueryKey, gitShowQueryKey } from '@/shared/api/git';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { historyDateLabel, remoteCommitUrl, splitPatchByFile } from '../model/source-control';
import { buildCommitGraph, type GraphRow } from '../model/source-control-graph';
import { CommitRow } from './source-control-commit-row';
import { RevertCommitConfirm, SourceControlHistoryDetail } from './source-control-history-detail';

interface SourceControlHistoryProps {
  projectId: string;
  active: boolean;
  remote: string | null;
  revertPending: boolean;
  tabs: ReactNode;
  onRevert: (sha: string) => void;
  onBranchFrom: (sha: string) => void;
}

export function SourceControlHistory({
  projectId,
  active,
  remote,
  revertPending,
  tabs,
  onRevert,
  onBranchFrom,
}: SourceControlHistoryProps) {
  const [filter, setFilter] = useState('');
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [revertSha, setRevertSha] = useState<string | null>(null);
  const logQuery = useQuery({
    queryKey: gitLogQueryKey(projectId),
    queryFn: () => getGitLog(projectId),
    enabled: Boolean(projectId) && active,
    staleTime: 20000,
  });
  const showQuery = useQuery({
    queryKey: selectedSha ? gitShowQueryKey(projectId, selectedSha) : ['git-show-none'],
    queryFn: () => getGitShow(projectId, selectedSha as string),
    enabled: Boolean(projectId && active && selectedSha),
  });
  const commits = logQuery.data?.commits ?? [];
  const filtered = filterCommits(commits, filter);
  const groups = groupCommits(filtered);
  const graph = buildCommitGraph(commits);
  const graphRows = new Map(graph.rows.map((row) => [row.sha, row]));
  const detail = showQuery.data;
  const patchChunks = detail ? splitPatchByFile(detail.patch) : new Map<string, string>();
  const patch = resolvePatch(detail, patchChunks, selectedFile);
  useEffect(() => {
    if (!selectedSha && commits.length > 0) {
      setSelectedSha(commits[0]?.sha ?? null);
    }
  }, [commits, selectedSha]);
  const selectCommit = (sha: string) => {
    setSelectedSha(sha);
    setSelectedFile(null);
  };
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 w-[348px] shrink-0 flex-col border-r">
        <div className="shrink-0 border-b p-2">{tabs}</div>
        <div className="shrink-0 p-2">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter commits"
            aria-label="Filter commits"
            className="h-7 text-xs"
          />
        </div>
        <HistoryLog
          pending={logQuery.isPending}
          isError={logQuery.isError}
          total={commits.length}
          groups={groups}
          graphRows={graphRows}
          lanes={graph.lanes}
          selectedSha={selectedSha}
          onSelect={selectCommit}
        />
      </div>
      <HistoryDetailPane
        selectedSha={selectedSha}
        pending={showQuery.isPending}
        isError={showQuery.isError}
        detail={detail}
        patch={patch}
        remote={remote}
        selectedFile={selectedFile}
        onSelectFile={(path) => setSelectedFile((prev) => (prev === path ? null : path))}
        onRevert={() => {
          if (selectedSha) {
            setRevertSha(selectedSha);
          }
        }}
        onBranchFrom={() => {
          if (selectedSha) {
            onBranchFrom(selectedSha);
          }
        }}
      />
      {revertSha ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
          <RevertCommitConfirm
            sha={revertSha}
            pending={revertPending}
            onCancel={() => setRevertSha(null)}
            onConfirm={() => {
              onRevert(revertSha);
              setRevertSha(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function HistoryLog({
  pending,
  isError,
  total,
  groups,
  graphRows,
  lanes,
  selectedSha,
  onSelect,
}: {
  pending: boolean;
  isError: boolean;
  total: number;
  groups: Array<{ label: string; commits: GitCommitSummary[] }>;
  graphRows: Map<string, GraphRow>;
  lanes: number;
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}) {
  if (pending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-destructive text-sm">
        Failed to load history
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-muted-foreground text-sm">
        {total === 0 ? 'No commits yet' : 'No matching commits'}
      </div>
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-2 p-2">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col">
            <div className="px-1 py-1 text-[11px] text-muted-foreground uppercase tracking-wide">
              {group.label}
            </div>
            <ul className="flex flex-col">
              {group.commits.map((item) => {
                const row = graphRows.get(item.sha);
                return (
                  <li key={item.sha}>
                    <CommitRow
                      commit={item}
                      graphRow={row}
                      lanes={lanes}
                      active={item.sha === selectedSha}
                      onSelect={() => onSelect(item.sha)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function HistoryDetailPane({
  selectedSha,
  pending,
  isError,
  detail,
  patch,
  remote,
  selectedFile,
  onSelectFile,
  onRevert,
  onBranchFrom,
}: {
  selectedSha: string | null;
  pending: boolean;
  isError: boolean;
  detail: GitCommitDetail | undefined;
  patch: string;
  remote: string | null;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onRevert: () => void;
  onBranchFrom: () => void;
}) {
  if (!selectedSha) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
        Select a commit to view details
      </div>
    );
  }
  if (pending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-destructive text-sm">
        Failed to load commit
      </div>
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <SourceControlHistoryDetail
        detail={detail}
        patch={patch}
        remoteUrl={remoteCommitUrl(remote, detail.commit.sha)}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        onRevert={onRevert}
        onBranchFrom={onBranchFrom}
      />
    </div>
  );
}

function resolvePatch(
  detail: GitCommitDetail | undefined,
  chunks: Map<string, string>,
  selectedFile: string | null,
): string {
  if (!detail) {
    return '';
  }
  if (selectedFile) {
    return chunks.get(selectedFile) ?? detail.patch;
  }
  return detail.patch;
}

function filterCommits(commits: GitCommitSummary[], filter: string): GitCommitSummary[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return commits;
  }
  return commits.filter(
    (commit) =>
      commit.subject.toLowerCase().includes(needle) ||
      commit.author.name.toLowerCase().includes(needle) ||
      commit.shortSha.toLowerCase().includes(needle),
  );
}

function groupCommits(
  commits: GitCommitSummary[],
): Array<{ label: string; commits: GitCommitSummary[] }> {
  const groups: Array<{ label: string; commits: GitCommitSummary[] }> = [];
  for (const commit of commits) {
    const label = historyDateLabel(commit.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.commits.push(commit);
    } else {
      groups.push({ label, commits: [commit] });
    }
  }
  return groups;
}
