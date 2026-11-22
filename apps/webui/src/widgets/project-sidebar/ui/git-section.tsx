import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useIdeStore } from '@/features/ide';
import { useStudioNavigation } from '@/shared/config/navigation';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';
import { type GitProjectChanges, useGitChanges } from '../model/use-git-changes';
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
                {open ? <GitProjectFiles entry={entry} depth={1} /> : null}
              </div>
            );
          })
        : changes.map((entry) => (
            <div key={entry.project.id} data-testid={`git-project-${entry.project.id}`}>
              <GitProjectFiles entry={entry} depth={0} />
            </div>
          ))}
    </div>
  );
}

function GitProjectFiles({ entry, depth }: { entry: GitProjectChanges; depth: number }) {
  const { files } = entry;
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
        <SidebarRow
          key={`${entry.project.id}:${file.path}`}
          title={file.path}
          depth={depth}
          onClick={() => {
            useIdeStore.getState().openDiff(entry.project.id, file.path);
            openDiff(entry.project.id, file.path);
          }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center" />
            <span className="flex size-4 shrink-0 items-center justify-center">
              <span
                className={cn('font-mono text-[10px] uppercase', gitStatusColorClass(file.status))}
                style={{ color: gitColors[file.status] }}
              >
                {gitFileStatusLabel(file.status)}
              </span>
            </span>
            <SidebarRowTitle className="font-mono text-[12px]">{file.path}</SidebarRowTitle>
          </span>
        </SidebarRow>
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
  const branchLabel = entry.branch ?? entry.head?.slice(0, 7) ?? 'HEAD';
  const dirty = entry.files.length > 0 ? entry.files.length : null;
  const ahead = entry.ahead;
  const behind = entry.behind;
  return (
    <SidebarRow
      testId={`git-project-${entry.project.id}`}
      trailing={
        <>
          {branchLabel ? (
            <span className="shrink-0 rounded-sm bg-sidebar-accent px-1 font-mono font-normal text-[10px] text-muted-foreground leading-4">
              {branchLabel}
            </span>
          ) : null}
          {dirty !== null ? (
            <span className="shrink-0 font-normal text-[10px] text-status-warn">• {dirty}</span>
          ) : null}
          {ahead || behind ? (
            <span className="shrink-0 font-normal text-[10px]">
              ↑{ahead} ↓{behind}
            </span>
          ) : null}
        </>
      }
      actions={<GitSectionMenu projectId={entry.project.id} />}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <ChevronRightIcon
            className={cn(
              'size-3.5 text-sidebar-foreground/50 transition-transform',
              open && 'rotate-90',
            )}
          />
        </span>
        <span className="flex size-[18px] shrink-0 items-center justify-center">
          <FolderTypeIcon open={open} />
        </span>
        <SidebarRowTitle>{entry.project.name}</SidebarRowTitle>
      </span>
    </SidebarRow>
  );
}
