import {
  DownloadIcon,
  GitCommitVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import { useFileSelectionStore } from '../model/file-selection.store';
import { useGitActions } from '../model/use-git-actions';
import type { GitStatus } from '../model/use-git-changes';
import { BranchRow } from './branch-row';
import { formatCountsShort } from './git-counts';

function BranchLists({
  filteredRecent,
  filteredLocal,
  onCheckout,
  onNewBranch,
  onDelete,
  deletePending,
}: {
  filteredRecent: { name: string; current?: boolean }[];
  filteredLocal: { name: string; current?: boolean }[];
  onCheckout: (name: string) => void;
  onNewBranch: (from?: string) => void;
  onDelete: (name: string) => void;
  deletePending: boolean;
}) {
  return (
    <>
      {filteredRecent.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            {filteredRecent.map((b) => (
              <BranchRow
                key={`recent-${b.name}`}
                name={b.name}
                current={Boolean(b.current)}
                onCheckout={() => onCheckout(b.name)}
                onNewBranch={() => onNewBranch(b.name)}
                onDelete={() => onDelete(b.name)}
                deletePending={deletePending}
              />
            ))}
          </DropdownMenuGroup>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Local</DropdownMenuLabel>
        {filteredLocal.length === 0 ? (
          <div className="px-2 py-1 text-muted-foreground text-xs">No branches</div>
        ) : (
          filteredLocal.map((b) => (
            <BranchRow
              key={`local-${b.name}`}
              name={b.name}
              current={Boolean(b.current)}
              onCheckout={() => onCheckout(b.name)}
              onNewBranch={() => onNewBranch(b.name)}
              onDelete={() => onDelete(b.name)}
              deletePending={deletePending}
            />
          ))
        )}
      </DropdownMenuGroup>
    </>
  );
}

export function GitActiveRepoMenuItems({
  projectId,
  status,
  refresh,
  includeRemoteRefresh,
  onRemoteRefresh,
  remoteRefreshPending,
}: {
  projectId: string;
  status: GitStatus;
  refresh: () => void;
  includeRemoteRefresh?: boolean;
  onRemoteRefresh?: () => void;
  remoteRefreshPending?: boolean;
}) {
  const [filter] = useState('');
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const {
    checkoutMutation,
    commitMutation,
    pushMutation,
    pullMutation,
    stageMutation,
    deleteMutation,
    handleCommit,
    handlePush,
    handlePull,
    handleAddAll,
    handleAddSelected,
    handleNewBranch,
  } = useGitActions(projectId);
  const localBranches = status.branches?.local ?? [];
  const recentBranches = status.branches?.recent ?? [];
  const filterQuery = filter.trim().toLowerCase();
  const filteredLocal = filterQuery
    ? localBranches.filter((b) => b.name.toLowerCase().includes(filterQuery))
    : localBranches;
  const filteredRecent = filterQuery
    ? recentBranches.filter((b) => b.name.toLowerCase().includes(filterQuery))
    : recentBranches;
  let commitSuffix = '';
  if (status.dirty) {
    commitSuffix = status.counts
      ? ` • ${formatCountsShort(status.counts)}`
      : ` • ${status.dirtyCount}`;
  }
  const hasRemote = Boolean(status.remote);
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={handleCommit}
          disabled={!status.dirty || commitMutation.isPending}
        >
          <GitCommitVerticalIcon className="size-3" />
          Commit{commitSuffix}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePush} disabled={!hasRemote || pushMutation.isPending}>
          <UploadIcon className="size-3" />
          Push
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePull} disabled={!hasRemote || pullMutation.isPending}>
          <DownloadIcon className="size-3" />
          Update
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={stageMutation.isPending}>
            <PlusIcon className="size-3" />
            Add
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={handleAddAll} disabled={stageMutation.isPending}>
              All
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleAddSelected(selectedPaths)}
              disabled={selectedPaths.length === 0 || stageMutation.isPending}
            >
              Selected{selectedPaths.length ? ` (${selectedPaths.length})` : ''}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => handleNewBranch()}>
          <PlusIcon className="size-3" />
          New Branch...
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="project-git-refresh"
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
      <BranchLists
        filteredRecent={filteredRecent}
        filteredLocal={filteredLocal}
        onCheckout={(name) => checkoutMutation.mutate(name)}
        onNewBranch={handleNewBranch}
        onDelete={(name) => deleteMutation.mutate(name)}
        deletePending={deleteMutation.isPending}
      />
    </>
  );
}
