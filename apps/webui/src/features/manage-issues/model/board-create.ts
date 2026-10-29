import type { BoardTemplateKey } from '@harnesys/contracts';
import { openBoardCreateSettingsDialog } from '../ui/board-settings-dialog';
import { createIssueBoardRecord, deleteIssueBoardCascade } from './boards';

const DRAFT_NAMES: Record<BoardTemplateKey, string> = {
  dev: 'Dev board',
  simple: 'Simple board',
  crm: 'CRM board',
  blank: 'Blank board',
};

export async function createBoardFromTemplate(
  orgId: string,
  template: BoardTemplateKey,
): Promise<string | null> {
  const board = await createIssueBoardRecord(orgId, DRAFT_NAMES[template], template);
  if (!board) {
    return null;
  }
  const result = await openBoardCreateSettingsDialog(orgId, board.id);
  if (result !== 'created') {
    await deleteIssueBoardCascade(orgId, board.id);
    return null;
  }
  return board.id;
}
