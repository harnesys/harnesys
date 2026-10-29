import type { IssueWorktreeRef, Source } from '@harnesys/contracts';
import type { BoardStatus } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { CloudIcon, FolderIcon, GitBranchIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { openAttachGitDialog } from '@/features/attach-git';
import { selfNodeCached } from '@/shared/api/fleet';
import { listGitBranches, listSources } from '@/shared/api/sources';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { type IssueBranchCreateInput, IssueBranchField } from './issue-branch-field';
import { IssueWorktreeCard } from './issue-worktree-card';

const NO_SOURCE = '__no_source__';

export interface IssueSourceFieldsValue {
  sourceId: string;
  branch: string | null;
}

function SourceKindIcon({ source }: { source: Source | null }): React.ReactNode {
  if (!source) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {source.distribution.kind === 'cloud-drive' ? (
        <CloudIcon className="size-3.5 text-muted-foreground" />
      ) : (
        <FolderIcon className="size-3.5 text-muted-foreground" />
      )}
      {source.vcs != null ? <GitBranchIcon className="size-3 text-amber-500" /> : null}
    </span>
  );
}

export function IssueSourceFields({
  orgId,
  value,
  disabled = false,
  attachedBranch = null,
  branchNameSeed = '',
  busy = false,
  creating = false,
  worktree = null,
  worktreeOnStatus = null,
  statuses,
  onChange,
  onCreateBranch,
  onCreateWorktree,
  onWorktreeOnStatusChange,
}: {
  orgId: string;
  value: IssueSourceFieldsValue;
  disabled?: boolean;
  attachedBranch?: string | null;
  branchNameSeed?: string;
  busy?: boolean;
  creating?: boolean;
  worktree?: IssueWorktreeRef | null;
  worktreeOnStatus?: string | null;
  statuses?: BoardStatus[];
  onChange: (value: IssueSourceFieldsValue) => void;
  onCreateBranch?: (input: IssueBranchCreateInput) => void;
  onCreateWorktree?: () => void;
  onWorktreeOnStatusChange?: (statusKey: string | null) => void;
}) {
  const { data: sourcesData } = useQuery({
    queryKey: ['sources', orgId],
    queryFn: () => listSources(orgId),
  });
  const sources = sourcesData?.sources ?? [];
  const selected = sources.find((source) => source.id === value.sourceId) ?? null;
  const touched = useRef(false);

  useEffect(() => {
    if (touched.current || value.sourceId !== '' || sources.length !== 1) {
      return;
    }
    onChange({ sourceId: sources[0].id, branch: null });
  }, [sources, value.sourceId, onChange]);

  const hostId = selfNodeCached() ?? '';
  const branchesQuery = useQuery({
    queryKey: ['git-branches', orgId, value.sourceId, hostId],
    queryFn: () => listGitBranches(orgId, value.sourceId, hostId),
    enabled: selected?.vcs != null && Boolean(hostId),
  });
  const branches = branchesQuery.data?.branches ?? [];
  const activeBranch = branchesQuery.data?.activeBranch ?? null;
  const displayBranches =
    attachedBranch && !branches.includes(attachedBranch) ? [...branches, attachedBranch] : branches;

  const onSourceChange = (next: string): void => {
    touched.current = true;
    const sourceId = !next || next === NO_SOURCE ? '' : next;
    onChange({ sourceId, branch: null });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="font-medium text-muted-foreground text-xs">Source</Label>
        <Select
          items={[
            { value: NO_SOURCE, label: 'No source' },
            ...sources.map((source) => ({ value: source.id, label: source.name })),
          ]}
          value={value.sourceId || NO_SOURCE}
          disabled={disabled}
          onValueChange={(next) => onSourceChange(String(next))}
        >
          <SelectTrigger className="w-full" data-testid="issue-source-select">
            <SelectValue placeholder={sources.length === 0 ? 'No sources yet' : 'Select source'}>
              {(selectedValue: unknown) => {
                const source = sources.find((item) => item.id === selectedValue);
                if (!source) {
                  return sources.length === 0 ? 'No sources yet' : 'No source';
                }
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceKindIcon source={source} />
                    <span className="truncate">{source.name}</span>
                  </span>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sources.length === 0 ? (
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                No sources yet —{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:underline"
                  onClick={() => openAttachGitDialog()}
                >
                  attach a git repository
                </button>
              </div>
            ) : (
              <>
                <SelectItem value={NO_SOURCE}>No source</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <SourceKindIcon source={source} />
                      <span className="truncate">{source.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {selected && selected.vcs != null ? (
        <IssueBranchField
          branches={displayBranches}
          activeBranch={activeBranch}
          attachedBranch={attachedBranch}
          branch={value.branch}
          disabled={disabled}
          hasError={branchesQuery.isError}
          busy={busy}
          branchNameSeed={branchNameSeed}
          onChange={(branch) => onChange({ ...value, branch })}
          onCreateBranch={onCreateBranch}
        />
      ) : null}

      {selected && selected.vcs == null ? (
        <p className="text-muted-foreground text-xs">
          Git not detected — Initialize repository in the source menu to use worktrees.
        </p>
      ) : null}

      {selected && selected.vcs != null ? (
        <IssueWorktreeCard
          branch={value.branch ?? attachedBranch}
          worktree={worktree}
          activeBranch={activeBranch}
          statuses={statuses}
          worktreeOnStatus={worktreeOnStatus}
          busy={busy}
          creating={creating}
          onCreateWorktree={onCreateWorktree}
          onWorktreeOnStatusChange={onWorktreeOnStatusChange}
        />
      ) : null}
    </div>
  );
}
