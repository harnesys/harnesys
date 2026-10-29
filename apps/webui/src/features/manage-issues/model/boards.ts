import {
  BOARD_TEMPLATES,
  type BoardTemplateKey,
  type UpdateIssueBoardBody,
} from '@harnesys/contracts';
import { useIssueBoardStore, useIssueStore } from '@/entities/issue';
import {
  createIssueBoard,
  deleteIssueBoard,
  type IssueBoardRecord,
  setIssueBoardArchived,
  updateIssueBoard,
} from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import { errorMessage } from './issue-errors';

export async function createIssueBoardRecord(
  orgId: string,
  name: string,
  template: BoardTemplateKey,
): Promise<IssueBoardRecord | null> {
  const trimmed = name.trim();
  if (!orgId || !trimmed) {
    return null;
  }
  const definition = BOARD_TEMPLATES[template];
  try {
    const board = await createIssueBoard(orgId, {
      name: trimmed,
      template,
      ...(definition.color !== undefined ? { color: definition.color } : {}),
      ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
    });
    useIssueBoardStore.getState().upsert(board);
    return board;
  } catch (error) {
    toast.add({ title: 'Board creation failed', description: errorMessage(error), type: 'error' });
    return null;
  }
}

export async function updateIssueBoardRecord(
  orgId: string,
  boardId: string,
  body: UpdateIssueBoardBody,
): Promise<boolean> {
  try {
    const board = await updateIssueBoard(orgId, boardId, body);
    useIssueBoardStore.getState().upsert(board);
    return true;
  } catch (error) {
    toast.add({ title: 'Board update failed', description: errorMessage(error), type: 'error' });
    return false;
  }
}

export async function setIssueBoardArchive(orgId: string, boardId: string): Promise<void> {
  try {
    const board = await setIssueBoardArchived(orgId, boardId, true);
    useIssueBoardStore.getState().upsert(board);
  } catch (error) {
    toast.add({ title: 'Archive failed', description: errorMessage(error), type: 'error' });
  }
}

export async function restoreIssueBoard(orgId: string, boardId: string): Promise<void> {
  try {
    const board = await setIssueBoardArchived(orgId, boardId, false);
    useIssueBoardStore.getState().upsert(board);
  } catch (error) {
    toast.add({ title: 'Restore failed', description: errorMessage(error), type: 'error' });
  }
}

export async function deleteIssueBoardCascade(orgId: string, boardId: string): Promise<void> {
  await deleteIssueBoard(orgId, boardId);
  const issueIds = useIssueStore
    .getState()
    .items.filter((issue) => issue.boardId === boardId)
    .map((issue) => issue.id);
  const issueStore = useIssueStore.getState();
  for (const issueId of issueIds) {
    issueStore.remove(issueId);
  }
  useIssueBoardStore.getState().remove(boardId);
}
