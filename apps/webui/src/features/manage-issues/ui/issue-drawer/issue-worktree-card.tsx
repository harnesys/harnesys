import type { IssueWorktreeRef } from '@harnesys/contracts';
import type { BoardStatus } from '@harnesys/studio-shared';
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
    </div>
  );
}
