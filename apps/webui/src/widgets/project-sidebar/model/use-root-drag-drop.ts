import type { ProjectMoveItem } from '@harnesys/studio-shared';
import {
  buildMoveItems,
  canDropInto,
  moveDrag,
  sameMoveScope,
  setMoveDrag,
} from '@/features/move-project-files';

export function useRootDragDrop({
  projectId,
  mutate,
}: {
  projectId: string;
  mutate: (items: ProjectMoveItem[]) => void;
}): {
  handleRootDrop: (event: React.DragEvent) => void;
  handleRootDragOver: (event: React.DragEvent) => void;
} {
  const handleRootDrop = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId)) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    const items = buildMoveItems(drag.paths, '');
    if (items.length === 0 || !canDropInto(drag.paths, '')) {
      return;
    }
    event.preventDefault();
    setMoveDrag(null);
    mutate(items);
  };
  const handleRootDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId)) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    if (!canDropInto(drag.paths, '') || buildMoveItems(drag.paths, '').length === 0) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };
  return { handleRootDrop, handleRootDragOver };
}
