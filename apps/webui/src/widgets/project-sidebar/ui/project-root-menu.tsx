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
  ReplaceIcon,
  ScanSearchIcon,
  SearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { openFindInFilesDialog, openReplaceInFilesDialog } from '@/features/find-in-files';
import { useOpenNewTerminal } from '@/features/ide';
import { openProjectSettingsDialog } from '@/features/manage-project-settings';
import { getActiveOrgId } from '@/shared/api/active-org';
import { refreshOrgAddonSource } from '@/shared/api/addon-sources';
import { revealProjectEntry, sourceFilesTreeQueryKey } from '@/shared/api/files';
import { selfNodeCached } from '@/shared/api/fleet';
import { invalidateGitOrgSummary, pushGit } from '@/shared/api/git';
import { type BridgedProject, projectQueryKey } from '@/shared/api/projects';
import { getSourceHostStatus, refreshGitSource } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { IconRef } from '@/shared/ui/icon';
import { toast } from '@/shared/ui/toast';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useViewerCreates } from '../model/viewer-creates';
import {
  useWorktreesHidden,
  useWorktreesVisibilityStore,
} from '../model/worktrees-visibility.store';
import { GitRepoMenuItems } from './git-menu';

export interface ProjectRootMenuProps {
  projectId: string;
  dirPath: string;
  project?: BridgedProject;
  onAddRemote: () => void;
}

export function ProjectRootMenu({
  projectId,
  dirPath,
  project,
  onAddRemote,
}: ProjectRootMenuProps) {
  const label = dirPath || 'project root';
  return (
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
        <ProjectRootMenuItems
          projectId={projectId}
          dirPath={dirPath}
          project={project}
          onAddRemote={onAddRemote}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectRootMenuItems({
  projectId,
  dirPath,
  project,
  onAddRemote,
}: ProjectRootMenuProps) {
  const start = useExplorerDraftStore((state) => state.start);
  const viewerCreates = useViewerCreates();
  const queryClient = useQueryClient();
  const openNewTerminal = useOpenNewTerminal();
  const isRoot = dirPath === '';
  const hasGit = project?.hasGit === true;
  const hasRemote = project?.gitRemote != null;
  const mayHaveGit = project ? project.driver === 'host-bound' || hasGit : false;
  const isCloud = project?.driver === 'addon-cloud';
  const refreshMutation = useMutation({
    mutationFn: async (): Promise<{ conflicts?: string[] } | undefined> => {
      const orgId = getActiveOrgId();
      if (!orgId) {
        throw new Error('No active org');
      }
      const hostId = selfNodeCached();
      if (!hostId) {
        throw new Error('Host id is required');
      }
      if (isCloud && project?.addonId) {
        return refreshOrgAddonSource(orgId, project.addonId, projectId);
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
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => start('file', dirPath, projectId)}>
          <FileIcon className="size-3.5" />
          New file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => start('dir', dirPath, projectId)}>
          <FolderIcon className="size-3.5" />
          New folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="project-find-in-files"
          onClick={() => {
            void openFindInFilesDialog({
              sourceId: projectId,
              ...(isRoot ? {} : { dir: dirPath }),
            });
          }}
        >
          <SearchIcon className="size-3.5" />
          Find in Files
          <DropdownMenuShortcut>⇧⌘F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="project-replace-in-files"
          onClick={() => {
            void openReplaceInFilesDialog({
              sourceId: projectId,
              ...(isRoot ? {} : { dir: dirPath }),
            });
          }}
        >
          <ReplaceIcon className="size-3.5" />
          Replace in Files
          <DropdownMenuShortcut>⇧⌘R</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
        {viewerCreates.length > 0 ? <DropdownMenuSeparator /> : null}
        {viewerCreates.map((template) => (
          <DropdownMenuItem
            key={template.viewerId}
            onClick={() => start('file', dirPath, projectId, template)}
          >
            {template.icon === undefined ? (
              <FileIcon className="size-3.5" />
            ) : (
              <IconRef icon={template.icon} className="size-3.5" />
            )}
            {template.label}
          </DropdownMenuItem>
        ))}
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
                onAddRemote();
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
