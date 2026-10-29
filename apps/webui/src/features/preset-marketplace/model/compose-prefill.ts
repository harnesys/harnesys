import type { BoardRule, BoardStatus } from '@harnesys/contracts';
import type { ComposeTeamPresetPrefill } from '../ui/compose-team-preset-dialog';

export interface ComposePrefillBoard {
  name: string;
  description: string;
  statuses: BoardStatus[];
  rules: BoardRule[];
}

export function composePrefillFromBoard(board: ComposePrefillBoard): ComposeTeamPresetPrefill {
  const rules: { statusKey: string; agentId: string }[] = [];
  const agentIds = new Set<string>();
  for (const rule of board.rules) {
    if (rule.trigger.type !== 'status_entered') {
      continue;
    }
    for (const action of rule.actions) {
      if (action.type !== 'assign_agent') {
        continue;
      }
      rules.push({ statusKey: rule.trigger.statusKey, agentId: action.agentId });
      agentIds.add(action.agentId);
    }
  }
  return {
    name: board.name,
    description: board.description,
    statuses: board.statuses,
    rules,
    agentIds: [...agentIds],
  };
}
