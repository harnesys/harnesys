import type { IssueWorktreeRef, Source, WorkspaceRef } from '@harnesys/contracts';
import type { BoardStatus } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { CloudIcon, FolderIcon, GitBranchIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { openAttachGitDialog } from '@/features/attach-git';
import { selfNodeCached } from '@/shared/api/fleet';
import { listGitBranches, listSources } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { type IssueBranchCreateInput, IssueBranchField } from './issue-branch-field';
import { IssueWorktreeCard } from './issue-worktree-card';

export interface IssueSourceFieldsValue {
  sourceId: string;
  workspaceSubpath: string | null;
  branch: string | null;
}

function SourceKindIcon({ source }: { source: Source | null }): React.ReactNode {
  if (!source) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {source.distribution.kind !== 'host-bound' ? (
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
  issueId = null,
  value,
  disabled = false,
  attachedBranch = null,
  branchNameSeed = '',
  busy = false,
  creating = false,
  worktree = null,
  worktreeOnStatus = null,
  agentDefaultWorkspaceRef = null,
  statuses,
  onChange,
  onCreateBranch,
  onCreateWorktree,
  onWorktreeOnStatusChange,
}: {
  orgId: string;
  issueId?: string | null;
  value: IssueSourceFieldsValue;
  disabled?: boolean;
  attachedBranch?: string | null;
  branchNameSeed?: string;
  busy?: boolean;
  creating?: boolean;
  worktree?: IssueWorktreeRef | null;
  worktreeOnStatus?: string | null;
  agentDefaultWorkspaceRef?: WorkspaceRef | null;
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
  const managed = sources.find((source) => source.managed) ?? null;
  const effectiveSourceId = value.sourceId || managed?.id || '';
  const selected = sources.find((source) => source.id === effectiveSourceId) ?? null;
  const touched = useRef(false);
  const [subpathDraft, setSubpathDraft] = useState<string | null>(null);
  const subpath = subpathDraft ?? value.workspaceSubpath ?? '';
  const subpathInvalid = subpath.trim().startsWith('/') || subpath.trim().split('/').includes('..');
  const applySubpath = (next: string | null): void => {
    setSubpathDraft(null);
    const trimmed = next?.trim() ?? '';
    onChange({
      ...value,
      workspaceSubpath: trimmed === '' ? null : trimmed,
    });
  };

  const hostId = selfNodeCached() ?? '';
  const branchesQuery = useQuery({
    queryKey: ['git-branches', orgId, effectiveSourceId, hostId],
    queryFn: () => listGitBranches(orgId, effectiveSourceId, hostId),
    enabled: selected?.vcs != null && Boolean(hostId),
  });
  const branches = branchesQuery.data?.branches ?? [];
  const activeBranch = branchesQuery.data?.activeBranch ?? null;
  const displayBranches =
    attachedBranch && !branches.includes(attachedBranch) ? [...branches, attachedBranch] : branches;

  const onSourceChange = (next: string): void => {
    if (!next) {
      return;
    }
    touched.current = true;
    onChange({ sourceId: next, workspaceSubpath: null, branch: null });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="font-medium text-muted-foreground text-xs">Source</Label>
        <Select
          items={sources.map((source) => ({
            value: source.id,
            label: source.managed ? `${source.name} — default issue source` : source.name,
          }))}
          value={effectiveSourceId}
          disabled={disabled}
          onValueChange={(next) => onSourceChange(String(next))}
        >
          <SelectTrigger className="w-full" data-testid="issue-source-select">
            <SelectValue placeholder={sources.length === 0 ? 'No sources yet' : 'Select source'}>
              {(selectedValue: unknown) => {
                const source = sources.find((item) => item.id === selectedValue);
                if (!source) {
                  return sources.length === 0 ? 'No sources yet' : 'Select source';
                }
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceKindIcon source={source} />
                    <span className="truncate">{source.name}</span>
                    {source.managed ? (
                      <span className="shrink-0 text-muted-foreground text-xs">(default)</span>
                    ) : null}
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
              sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceKindIcon source={source} />
                    <span className="truncate">{source.name}</span>
                    {source.managed ? (
                      <span className="shrink-0 text-muted-foreground text-xs">(default)</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            className="h-7 font-mono text-xs"
            placeholder="subfolder (optional)"
            aria-label="Issue workspace subfolder"
            aria-invalid={subpathInvalid || undefined}
            disabled={disabled}
            value={subpath}
            onChange={(event) => setSubpathDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applySubpath(subpath);
              }
            }}
          />
          {issueId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              data-testid="issue-subfolder-suggest"
              onClick={() => applySubpath(`issues/${issueId.slice(0, 8)}`)}
            >
              Use issue folder
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || subpathInvalid}
            onClick={() => applySubpath(subpath)}
          >
            Apply
          </Button>
        </div>
        {subpathInvalid ? (
          <p className="text-destructive text-xs">
            Subfolder must be relative and must not contain ".."
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Runs inside this subfolder of the issue source, created on the first run. Every agent
            the issue is handed to works here.
          </p>
        )}
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
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Git not detected — Initialize repository in the source menu to use worktrees.
          </p>
          <p className="text-muted-foreground text-xs" data-testid="issue-run-location">
            Every run on this issue, by any agent, works in{' '}
            <span className="font-mono text-foreground">{selected.name}</span>.
          </p>
        </div>
      ) : null}

      {selected && selected.vcs != null ? (
        <IssueWorktreeCard
          branch={value.branch ?? attachedBranch}
          worktree={worktree}
          activeBranch={activeBranch}
          statuses={statuses}
          sourceId={selected.id}
          sourceName={selected.name}
          workspaceSubpath={value.workspaceSubpath}
          agentDefaultWorkspaceRef={agentDefaultWorkspaceRef}
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
