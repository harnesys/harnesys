import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  TrashIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useIdeStore } from '@/features/ide';
import { revealProjectEntry } from '@/shared/api/files';
import {
  deleteRepositoryWorktree,
  type RepositoryWorktree,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { worktreeFilesTreeQueryKey } from './worktree-tree-key';

export function WorktreeRootMenu({
  projectId,
  orgId,
  worktree,
  onRefresh,
}: {
  projectId: string;
  orgId: string;
  worktree: RepositoryWorktree;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteRepositoryWorktree(orgId, projectId, worktree.id),
    onSuccess: async () => {
      for (const tab of useIdeStore.getState().workspace.tabs) {
        if (tab.projectId === projectId && tab.worktreeId === worktree.id) {
          useIdeStore.getState().closeTab(tab.id);
        }
      }
      await qc.invalidateQueries({ queryKey: repositoryWorktreesQueryKey(orgId, projectId) });
      await qc.invalidateQueries({
        queryKey: worktreeFilesTreeQueryKey(projectId, worktree.id),
      });
      toast.add({ title: 'Worktree deleted' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Delete worktree failed',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  const copyText = async (text: string, okTitle: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: okTitle });
    } catch {
      toast.add({ title: 'Could not copy' });
    }
  };
  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(next) => {
        setMenuOpen(next);
        if (!next) {
          setConfirming(false);
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Worktree actions · ${worktree.branch}`}
            className="opacity-0 group-hover/ws:opacity-100 data-open:opacity-100"
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Worktree actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {confirming ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              data-testid={`worktree-delete-confirm-${worktree.id}`}
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate();
                setConfirming(false);
                setMenuOpen(false);
              }}
            >
              <TrashIcon className="size-3.5" />
              Confirm delete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirming(false)}>Cancel</DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem data-testid={`worktree-refresh-${worktree.id}`} onClick={onRefresh}>
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void revealProjectEntry(projectId, '', worktree.id)}>
                <ScanSearchIcon className="size-3.5" />
                Reveal in Finder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void copyText(worktree.branch, 'Branch copied')}>
                <ClipboardIcon className="size-3.5" />
                Copy branch
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              data-testid={`worktree-delete-${worktree.id}`}
              closeOnClick={false}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon className="size-3.5" />
              Delete worktree…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
