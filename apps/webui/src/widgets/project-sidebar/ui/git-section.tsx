import { useState } from 'react';
import { useIdeStore } from '@/features/ide';
import { useStudioNavigation } from '@/shared/config/navigation';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { type GitProjectChanges, useGitChanges, useGitFileChanges } from '../model/use-git-changes';
import { gitFileStatusLabel } from './git-file-decorations';
import { GitSectionMenu } from './git-menu';
import { SidebarEmpty } from './sidebar-empty';

export function GitSection() {
  const changes = useGitChanges();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (changes.length === 0) {
    return <SidebarEmpty title="No changes" testId="git-empty" />;
  }
  const showFolders = changes.length > 1;
  const toggleExpanded = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
      {showFolders
        ? changes.map((entry) => {
            const open = expanded.has(entry.project.id);
            return (
              <div key={entry.project.id} data-testid={`git-project-${entry.project.id}`}>
                <GitProjectFolderRow
                  entry={entry}
                  open={open}
                  onToggle={() => toggleExpanded(entry.project.id)}
                />
                {open ? <GitProjectFiles entry={entry} /> : null}
              </div>
            );
          })
        : changes.map((entry) => (
            <div key={entry.project.id} data-testid={`git-project-${entry.project.id}`}>
              <GitProjectFiles entry={entry} />
            </div>
          ))}
    </div>
  );
}

function GitProjectFiles({ entry }: { entry: GitProjectChanges }) {
  const files = useGitFileChanges(entry.project.id);
  const { openDiff } = useStudioNavigation();
  const gitColors = useGitStatusColors((state) => state.colors);
  return (
    <>
      {entry.truncated ? (
        <div className="mx-1 rounded-md bg-status-warn/10 px-2 py-1 text-status-warn text-xs">
          Large repo — change list may be incomplete.
        </div>
      ) : null}
      {files.map((file) => (
        <button
          key={`${entry.project.id}:${file.path}`}
          type="button"
          title={file.path}
          onClick={() => {
            useIdeStore.getState().openDiff(entry.project.id, file.path);
            openDiff(entry.project.id, file.path);
          }}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-sidebar-accent/70"
        >
          <span
            className={cn(
              'w-3 shrink-0 text-center font-mono text-[10px] uppercase',
              gitStatusColorClass(file.status),
            )}
            style={{ color: gitColors[file.status] }}
          >
            {gitFileStatusLabel(file.status)}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.path}</span>
        </button>
      ))}
    </>
  );
}

function GitProjectFolderRow({
  entry,
  open,
  onToggle,
}: {
  entry: GitProjectChanges;
  open: boolean;
  onToggle: () => void;
}) {
  const branchLabel = entry.status
    ? (entry.status.branch ?? entry.status.head?.slice(0, 7) ?? 'HEAD')
    : null;
  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={open}
      className="group/ws relative flex items-center rounded-md hover:bg-sidebar-accent/70"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        onToggle();
      }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs"
        onClick={onToggle}
      >
        <FolderTypeIcon open={open} size="md" />
        <span className="min-w-0 flex-1 truncate font-medium group-data-[collapsible=icon]:hidden">
          {entry.project.name}
        </span>
        {branchLabel ? (
          <span className="shrink-0 rounded-sm bg-sidebar-accent px-1 font-mono font-normal text-[10px] text-muted-foreground leading-4 group-data-[collapsible=icon]:hidden">
            {branchLabel}
          </span>
        ) : null}
        {entry.status?.dirty ? (
          <span className="shrink-0 font-normal text-[10px] text-status-warn group-data-[collapsible=icon]:hidden">
            • {entry.status.dirtyCount}
          </span>
        ) : null}
        {entry.status && (entry.status.ahead || entry.status.behind) ? (
          <span className="shrink-0 font-normal text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            ↑{entry.status.ahead} ↓{entry.status.behind}
          </span>
        ) : null}
      </button>
      <span className="absolute top-1/2 right-1 -translate-y-1/2 group-data-[collapsible=icon]:hidden">
        <GitSectionMenu projectId={entry.project.id} />
      </span>
    </div>
  );
}
