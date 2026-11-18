import { ChevronRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProjects } from '@/entities/project';
import { openAddSourceDialog } from '@/features/attach-source';
import {
  buildMoveItems,
  canDropInto,
  moveDrag,
  sameMoveScope,
  setMoveDrag,
  useMoveProjectFiles,
} from '@/features/move-project-files';
import { selfNodeCached } from '@/shared/api/fleet';
import type { BridgedProject } from '@/shared/api/projects';
import { useOrgId } from '@/shared/config/location';
import { setEntityRefDrag } from '@/shared/lib/entity-ref-drag';
import { cn } from '@/shared/lib/utils';
import { SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useHiddenSourceIds, useSourceVisibilityStore } from '../model/source-visibility.store';
import { useOrgGitSummaries } from '../model/use-git-changes';
import { ProjectRootMenu } from './project-root-menu';
import { SidebarEmpty } from './sidebar-empty';
import { SourceBranches } from './source-branches';
import { SourceRootIcon } from './source-root-icon';

type RootDropState = 'valid' | 'invalid' | null;

function syncLabel(summary: { remote?: boolean; ahead?: number }): string {
  if (!summary.remote) {
    return 'no remote';
  }
  const ahead = summary.ahead ?? 0;
  return ahead > 0 ? `↑${ahead}` : 'synced';
}

function canMoveToProjectRoot(paths: string[]): boolean {
  return canDropInto(paths, '') && buildMoveItems(paths, '').length > 0;
}
function ProjectRoot({
  projectId,
  name,
  open,
  onToggle,
  project,
}: {
  projectId: string;
  name: string;
  open: boolean;
  onToggle: () => void;
  project?: BridgedProject;
}) {
  const moveMutation = useMoveProjectFiles(projectId);
  const summaries = useOrgGitSummaries();
  const summary = project ? summaries?.find((row) => row.sourceId === project.id) : undefined;
  const [dropState, setDropState] = useState<RootDropState>(null);
  const handleDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!canMoveToProjectRoot(drag.paths)) {
      setDropState('invalid');
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'move';
    setDropState('valid');
  };
  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropState(null);
    }
  };
  const handleDrop = (event: React.DragEvent) => {
    setDropState(null);
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId) || !canMoveToProjectRoot(drag.paths)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setMoveDrag(null);
    const items = buildMoveItems(drag.paths, '');
    if (items.length > 0) {
      moveMutation.mutate(items);
    }
  };
  return (
    <SidebarRow
      className={cn(
        dropState === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
        dropState === 'invalid' && 'cursor-not-allowed opacity-60',
      )}
      aria-expanded={open}
      data-drop={dropState ?? undefined}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        setEntityRefDrag(event.dataTransfer, { kind: 'source', id: projectId, name });
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onToggle}
      actions={<ProjectRootMenu projectId={projectId} dirPath="" project={project} />}
      trailing={
        summary?.isGit ? (
          <span
            className={cn(
              'text-[9px]',
              summary.remote ? 'text-status-live' : 'text-muted-foreground',
            )}
          >
            {syncLabel(summary)}
          </span>
        ) : null
      }
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
        <SourceRootIcon
          driver={project?.driver}
          hasGit={project?.hasGit === true}
          hasRemote={project?.gitRemote != null}
          managed={project?.managed === true}
          isLocal={project?.hostId != null && project.hostId === selfNodeCached()}
          open={open}
        />
        <SidebarRowTitle>{name}</SidebarRowTitle>
      </span>
    </SidebarRow>
  );
}
export function ProjectsTrees({ projectIds }: { projectIds: string[] }) {
  const orgId = useOrgId() ?? '';
  const projectQuery = useProjects();
  const projects = projectQuery.data ?? [];
  const toggleRoot = useExplorerExpandStore((s) => s.toggleRoot);
  const pruneRoots = useExplorerExpandStore((s) => s.pruneRoots);
  const roots = useExplorerExpandStore((s) => s.roots);
  const hidden = useHiddenSourceIds(orgId);
  const showAll = useSourceVisibilityStore((s) => s.showAll);
  const visibleIds = projectIds.filter((id) => !hidden.includes(id));
  useEffect(() => {
    pruneRoots(visibleIds);
  }, [visibleIds, pruneRoots]);
  if (projectIds.length === 0) {
    return (
      <SidebarEmpty
        title="No sources yet"
        onAction={() => {
          void openAddSourceDialog();
        }}
        testId="projects-empty-add"
      />
    );
  }
  if (visibleIds.length === 0) {
    return (
      <SidebarEmpty
        title="All sources are hidden"
        onAction={() => {
          showAll(orgId);
        }}
        testId="projects-show-all"
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {visibleIds.map((id) => {
        const project = projects.find((item) => item.id === id);
        if (!project) {
          return null;
        }
        const open = roots[id] === true;
        return (
          <div key={id} data-testid={`explorer-project-${id}`}>
            <ProjectRoot
              projectId={id}
              name={project.name}
              open={open}
              project={project}
              onToggle={() => {
                toggleRoot(id);
              }}
            />
            {open ? (
              <SourceBranches
                projectId={id}
                sourceName={project.name}
                hasGit={project.hasGit === true}
                depthOffset={1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
