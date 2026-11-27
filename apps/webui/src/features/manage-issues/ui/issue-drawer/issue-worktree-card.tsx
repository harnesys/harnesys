import type { IssueWorktreeRef, WorkspaceRef } from '@harnesys/contracts';
import type { BoardStatus, RunEnvironment } from '@harnesys/studio-shared';
import { describeEnvironment, resolveEnvironment } from '@harnesys/studio-shared';
import { FolderGitIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { sortedStatuses } from '../../model/board-columns';
import { issueWorkspacePlanView } from '../../model/issue-branch';

const NO_STATUS = '__no_status__';

export function IssueWorktreeCard({
  branch,
  worktree,
  activeBranch,
  statuses,
  sourceId = null,
  sourceName = null,
  workspaceSubpath = null,
  agentDefaultWorkspaceRef = null,
  worktreeOnStatus = null,
  busy = false,
  creating = false,
  onCreateWorktree,
  onWorktreeOnStatusChange,
}: {
  branch: string | null;
  worktree: IssueWorktreeRef | null;
  activeBranch: string | null;
  statuses?: BoardStatus[];
  sourceId?: string | null;
  sourceName?: string | null;
  workspaceSubpath?: string | null;
  agentDefaultWorkspaceRef?: WorkspaceRef | null;
  worktreeOnStatus?: string | null;
  busy?: boolean;
  creating?: boolean;
  onCreateWorktree?: () => void;
  onWorktreeOnStatusChange?: (statusKey: string | null) => void;
}) {
  const plan = issueWorkspacePlanView({ worktree, branch, activeBranch });
  const canHook =
    onWorktreeOnStatusChange !== undefined && statuses !== undefined && statuses.length > 0;
  const hasActions = onCreateWorktree !== undefined || canHook;
  const nextFireLabel = nextFireTargetLabel({
    worktree,
    sourceId,
    sourceName,
    workspaceSubpath,
    branch,
    agentDefaultWorkspaceRef,
  });
  return (
    <div
      className="space-y-2 rounded-md border px-3 py-2 text-xs"
      data-testid="issue-worktree-card"
    >
      {worktree ? (
        <p className="flex items-start gap-1.5">
          <FolderGitIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            Worktree ready @ <span className="break-all font-mono">{worktree.path}</span>
          </span>
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {plan === 'held'
              ? 'No worktree — the run will be held'
              : `No worktree — the run will use the active checkout${activeBranch ? ` (${activeBranch})` : ''}`}
          </p>
          {hasActions ? (
            <div className="flex flex-wrap items-center gap-2">
              {onCreateWorktree ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={onCreateWorktree}
                  data-testid="issue-worktree-create-now"
                >
                  {creating ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
                  Create now
                </Button>
              ) : null}
              {canHook ? (
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-muted-foreground">
                    Auto-create on entering
                  </span>
                  <Select
                    items={[
                      { value: NO_STATUS, label: 'Off' },
                      ...sortedStatuses(statuses).map((status) => ({
                        value: status.key,
                        label: status.label,
                      })),
                    ]}
                    value={worktreeOnStatus ?? NO_STATUS}
                    onValueChange={(next) =>
                      onWorktreeOnStatusChange(next === NO_STATUS ? null : String(next))
                    }
                  >
                    <SelectTrigger className="h-7 text-xs" data-testid="issue-worktree-on-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STATUS}>Off</SelectItem>
                      {sortedStatuses(statuses).map((status) => (
                        <SelectItem key={status.key} value={status.key}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <p className="text-muted-foreground" data-testid="issue-next-fire-target">
        Next fire runs in <span className="font-mono text-foreground">{nextFireLabel}</span>
      </p>
    </div>
  );
}

function issueRunRefOf(input: {
  worktree: IssueWorktreeRef | null;
  sourceId: string | null;
  sourceName: string | null;
  workspaceSubpath: string | null;
  agentDefaultWorkspaceRef: WorkspaceRef | null;
  branch: string | null;
}): WorkspaceRef | null {
  if (input.sourceId === null) {
    return null;
  }
  const subpath = input.workspaceSubpath === null ? {} : { subpath: input.workspaceSubpath };
  if (input.worktree !== null) {
    return {
      kind: 'worktree',
      sourceId: input.sourceId,
      worktreeId: input.worktree.id,
      ...subpath,
    };
  }
  return { kind: 'source', sourceId: input.sourceId, ...subpath };
}

function nextFireTargetLabel(input: {
  worktree: IssueWorktreeRef | null;
  sourceId: string | null;
  sourceName: string | null;
  workspaceSubpath: string | null;
  branch: string | null;
  agentDefaultWorkspaceRef: WorkspaceRef | null;
}): string {
  const runRef: WorkspaceRef | null = issueRunRefOf(input);
  const environment: RunEnvironment = resolveEnvironment({
    layers: [
      { origin: 'run', ref: runRef },
      { origin: 'agent', ref: input.agentDefaultWorkspaceRef },
    ],
    issue: true,
  });
  const sourceNameOf = (sourceId: string) =>
    sourceId === input.sourceId && input.sourceName !== null
      ? input.sourceName
      : sourceId.slice(0, 8);
  if (environment.provenance === 'run') {
    return describeEnvironment(environment, sourceNameOf);
  }
  if (environment.provenance === 'agent') {
    return `agent default (${describeEnvironment(environment, sourceNameOf)})`;
  }
  return 'thread directory';
}
