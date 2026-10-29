import { useState } from 'react';
import { useProjects } from '@/entities/project';
import {
  canDropInto,
  collapseToRoots,
  MOVE_DRAG_MIME,
  moveDrag,
  sameMoveScope,
  setMoveDrag,
} from '@/features/move-project-files';
import { setFileRefDrag } from '@/shared/lib/file-ref-drag';

type DropState = 'valid' | 'invalid' | null;

function selectDragPaths(selected: boolean, selectedPaths: string[], fullPath: string): string[] {
  if (selected && selectedPaths.length > 0) {
    return selectedPaths;
  }
  return [fullPath];
}

function appendDragGhost(event: React.DragEvent<HTMLDivElement>): void {
  const label = event.currentTarget.querySelector('[data-drag-label]');
  if (!(label instanceof HTMLElement)) {
    return;
  }
  const ghost = label.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-drag-label');
  ghost.style.position = 'fixed';
  ghost.style.top = '-1000px';
  ghost.style.left = '-1000px';
  ghost.style.width = 'max-content';
  ghost.style.maxWidth = '240px';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, Math.max(ghost.offsetHeight / 2, 1));
  requestAnimationFrame(() => {
    ghost.remove();
  });
}

function resolveDrop(
  drag: ReturnType<typeof moveDrag>,
  projectId: string,
  fullPath: string,
  isDir: boolean,
  worktreeId?: string,
): DropState {
  if (!isDir || !drag || !sameMoveScope(drag, projectId, worktreeId)) {
    return null;
  }
  return canDropInto(drag.paths, fullPath) ? 'valid' : 'invalid';
}

export function useFileRowDrag({
  projectId,
  worktreeId,
  fullPath,
  isDir,
  selected,
  selectedPaths,
  onMoveInto,
}: {
  projectId: string;
  worktreeId?: string;
  fullPath: string;
  isDir: boolean;
  selected: boolean;
  selectedPaths: string[];
  onMoveInto: (targetDir: string, paths: string[]) => void;
}) {
  const [dropState, setDropState] = useState<DropState>(null);
  const projects = useProjects().data ?? [];
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const roots = collapseToRoots(selectDragPaths(selected, selectedPaths, fullPath));
    setMoveDrag({ projectId, worktreeId, paths: roots });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(MOVE_DRAG_MIME, roots.join('\n'));
    event.dataTransfer.setData('text/plain', fullPath);
    const sourceName = projects.find((project) => project.id === projectId)?.name;
    setFileRefDrag(event.dataTransfer, {
      sourceId: projectId,
      ref: sourceName ? `${sourceName}/${fullPath}` : fullPath,
      relPath: fullPath,
    });
    appendDragGhost(event);
  };
  const handleDragOver = (event: React.DragEvent) => {
    const state = resolveDrop(moveDrag(), projectId, fullPath, isDir, worktreeId);
    if (!state) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = state === 'valid' ? 'move' : 'none';
    setDropState(state);
  };
  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropState(null);
    }
  };
  const handleDrop = (event: React.DragEvent) => {
    setDropState(null);
    const drag = moveDrag();
    if (!drag || resolveDrop(drag, projectId, fullPath, isDir, worktreeId) !== 'valid') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setMoveDrag(null);
    onMoveInto(fullPath, drag.paths);
  };
  const handleDragEnd = () => {
    setMoveDrag(null);
    setDropState(null);
  };
  return {
    dropState,
    dragProps: {
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
