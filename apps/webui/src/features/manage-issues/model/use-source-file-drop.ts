import { type DragEvent, useState } from 'react';
import { MOVE_DRAG_MIME, moveDrag } from '@/features/move-project-files';
import { addIssueSourceAttachmentAction } from './issue-detail-actions';
import { refreshIssueAttachmentCounts } from './refresh-issue-attachments';

export interface SourceFileDrop {
  dropping: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

export function useSourceFileDrop(orgId: string, issueId: string): SourceFileDrop {
  const [dropping, setDropping] = useState(false);
  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer.types.includes(MOVE_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDragLeave = (event: DragEvent): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropping(false);
    }
  };
  const onDrop = (event: DragEvent): void => {
    setDropping(false);
    const raw = event.dataTransfer.getData(MOVE_DRAG_MIME);
    if (!raw) {
      return;
    }
    const paths = raw.split('\n').filter(Boolean);
    const sourceId = moveDrag()?.projectId;
    if (paths.length === 0 || !sourceId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    for (const path of paths) {
      void addIssueSourceAttachmentAction(orgId, issueId, sourceId, path);
    }
    void refreshIssueAttachmentCounts(orgId);
  };
  return { dropping, onDragOver, onDragLeave, onDrop };
}
