import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardIcon,
  CloudUploadIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useOpenNewTerminal } from '@/features/ide';
import { openProjectSettingsDialog } from '@/features/manage-project-settings';
import { getActiveOrgId } from '@/shared/api/active-org';
import { revealProjectEntry, sourceFilesTreeQueryKey } from '@/shared/api/files';
import { selfNodeCached } from '@/shared/api/fleet';
import { invalidateGitOrgSummary, pushGit, setGitRemote } from '@/shared/api/git';
import { type BridgedProject, projectQueryKey } from '@/shared/api/projects';
import { getSourceHostStatus, refreshCloudDrive, refreshGitSource } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import {
  useWorktreesHidden,
  useWorktreesVisibilityStore,
} from '../model/worktrees-visibility.store';
import { GitRepoMenuItems } from './git-menu';

export function ProjectRootMenu({
  projectId,
  dirPath,
  project,
}: {
  projectId: string;
  dirPath: string;
  project?: BridgedProject;
}) {
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const start = useExplorerDraftStore((state) => state.start);
  const queryClient = useQueryClient();
  const openNewTerminal = useOpenNewTerminal();
  const isRoot = dirPath === '';
  const hasGit = project?.hasGit === true;
  const hasRemote = project?.gitRemote != null;
  const mayHaveGit = project ? project.driver === 'host-bound' || hasGit : false;
  const isCloud = project?.driver === 'cloud-drive';
  const label = dirPath || 'project root';
  const refreshMutation = useMutation({
    mutationFn: async (): Promise<{ skippedGoogleApps?: number } | undefined> => {
      const orgId = getActiveOrgId();
      if (!orgId) {
        throw new Error('No active org');
      }
      const hostId = selfNodeCached();
      if (!hostId) {
        throw new Error('Host id is required');
      }
      if (isCloud) {
        return refreshCloudDrive(orgId, projectId, hostId);
      }
      const status = await getSourceHostStatus(orgId, projectId);
      const row = status.statuses.find((item) => item.hostId === hostId) ?? status.statuses[0];
      await refreshGitSource(
        orgId,
        projectId,
        row?.hostId ?? hostId,
        row?.defaultWorktreeId ?? undefined,
      );
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      await queryClient.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      await queryClient.invalidateQueries({
        queryKey: ['source-file-content', projectId],
      });
      const skipped =
        result && typeof result === 'object' && 'skippedGoogleApps' in result
          ? result.skippedGoogleApps
          : undefined;
      const conflicts =
        result && typeof result === 'object' && 'conflicts' in result
          ? (result.conflicts as string[]).length
          : 0;
      if (isCloud && conflicts > 0) {
        toast.add({
          title: 'Synced with conflicts',
          description: `${conflicts} conflict copies saved next to the originals (both versions kept).`,
        });
        return;
      }
      if (isCloud && typeof skipped === 'number' && skipped > 0) {
        toast.add({
          title: 'Refreshed',
          description: `${skipped} Google Doc/Sheet/Slide skipped (export later)`,
        });
        return;
      }
      toast.add({ title: 'Refreshed' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Refresh failed';
      toast.add({ title: 'Refresh failed', description: msg });
    },
  });
  const copyPath = async () => {
    const text = dirPath || '.';
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: 'Path copied' });
    } catch {
      toast.add({ title: 'Could not copy path' });
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Folder actions · ${label}`}
              className="opacity-0 group-hover/file:opacity-100 group-hover/ws:opacity-100 data-open:opacity-100"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Folder actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => start('file', dirPath, projectId)}>
              <FileIcon className="size-3.5" />
              New file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => start('dir', dirPath, projectId)}>
              <FolderIcon className="size-3.5" />
              New folder
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="project-open-terminal"
              onClick={() => {
                void openNewTerminal(projectId, isRoot ? undefined : dirPath).catch(
                  (error: unknown) => {
                    toast.add({
                      title: 'Failed to open terminal',
                      description: error instanceof Error ? error.message : undefined,
                    });
                  },
                );
              }}
            >
              <SquareTerminalIcon className="size-3.5" />
              Terminal
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void copyPath()}>
              <ClipboardIcon className="size-3.5" />
              Copy path
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="project-reveal-in-finder"
              onClick={() => {
                revealProjectEntry(projectId, dirPath || '.').catch((error: unknown) => {
                  toast.add({
                    title: 'Reveal failed',
                    description: error instanceof Error ? error.message : undefined,
                  });
                });
              }}
            >
              <ScanSearchIcon className="size-3.5" />
              Reveal in Finder
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {isRoot && mayHaveGit ? (
            <>
              <DropdownMenuSeparator />
              <GitRepoMenuItems
                projectId={projectId}
                includeRemoteRefresh={hasGit && hasRemote}
                remoteRefreshPending={refreshMutation.isPending}
                onRemoteRefresh={hasGit && hasRemote ? () => refreshMutation.mutate() : undefined}
              />
              {hasGit && !hasRemote ? (
                <DropdownMenuItem
                  data-testid="project-add-remote"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAddRemoteOpen(true);
                  }}
                >
                  <LinkIcon className="size-3.5" />
                  Add remote…
                </DropdownMenuItem>
              ) : null}
              {hasGit && hasRemote ? <PublishMenuItem projectId={projectId} /> : null}
              {hasGit ? <WorktreesToggleItem projectId={projectId} /> : null}
            </>
          ) : null}
          {isRoot && isCloud ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  data-testid="project-cloud-refresh"
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate()}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
          {isRoot ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  data-testid="project-settings"
                  onClick={() => {
                    void openProjectSettingsDialog(projectId);
                  }}
                >
                  <SettingsIcon className="size-3.5" />
                  Settings…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddRemoteDialog
        projectId={projectId}
        open={addRemoteOpen}
        onClose={() => setAddRemoteOpen(false)}
      />
    </>
  );
}

function WorktreesToggleItem({ projectId }: { projectId: string }) {
  const worktreesHidden = useWorktreesHidden(projectId);
  const toggleWorktrees = useWorktreesVisibilityStore((state) => state.toggle);
  return (
    <DropdownMenuItem
      data-testid="project-toggle-worktrees"
      onClick={(event) => {
        event.stopPropagation();
        toggleWorktrees(projectId);
      }}
    >
      {worktreesHidden ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
      {worktreesHidden ? 'Show worktrees' : 'Hide worktrees'}
    </DropdownMenuItem>
  );
}

function AddRemoteDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const save = useMutation({
    mutationFn: () => setGitRemote(projectId, { url: url.trim() }),
    onSuccess: async () => {
      onClose();
      setUrl('');
      await qc.invalidateQueries({ queryKey: projectQueryKey });
      invalidateGitOrgSummary(qc);
      toast.add({ title: 'Remote added' });
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Could not add remote',
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setUrl('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add remote origin</DialogTitle>
        </DialogHeader>
        <Input
          data-testid="project-add-remote-url"
          value={url}
          placeholder="https://github.com/user/repo.git"
          onChange={(event) => setUrl(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="project-add-remote-save"
            disabled={!url.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishMenuItem({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const publish = useMutation({
    mutationFn: () => pushGit(projectId),
    onSuccess: async () => {
      invalidateGitOrgSummary(qc);
      toast.add({ title: 'Published' });
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
  return (
    <DropdownMenuItem
      data-testid="project-publish"
      disabled={publish.isPending}
      onClick={(event) => {
        event.stopPropagation();
        publish.mutate();
      }}
    >
      <CloudUploadIcon className="size-3.5" />
      Publish
    </DropdownMenuItem>
  );
}
