import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore } from '@/entities/issue';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { statusOf } from '../model/board-columns';
import { BoardRulesEditor } from './board-rules-editor';

export interface BoardColumnRulesData {
  orgId: string;
  boardId: string;
  statusKey: string;
}

export function openBoardColumnRulesDialog(orgId: string, boardId: string, statusKey: string) {
  const board = useIssueBoardStore.getState().boardById(boardId);
  const status = board ? statusOf(board.statuses, statusKey) : undefined;
  return dialog.open(BoardColumnRulesDialog, {
    title: status ? `Rules — ${status.label}` : 'Column rules',
    data: { orgId, boardId, statusKey },
    className: 'sm:max-w-lg',
  });
}

export function BoardColumnRulesDialog({
  data,
}: DialogComponentProps<unknown, BoardColumnRulesData>) {
  const orgId = data?.orgId ?? '';
  const boardId = data?.boardId ?? '';
  const statusKey = data?.statusKey ?? '';
  const board = useIssueBoardStore((state) => state.boardById(boardId));
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.orgId === orgId)),
  );
  const labels = useIssueLabelStore((state) => state.items);
  if (!board) {
    return null;
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto pr-1"
      data-testid={`column-rules-dialog-${statusKey}`}
    >
      <BoardRulesEditor
        orgId={orgId}
        boardId={board.id}
        rules={board.rules}
        statuses={board.statuses}
        agents={agents}
        labels={labels}
        statusScope={statusKey}
      />
    </div>
  );
}
