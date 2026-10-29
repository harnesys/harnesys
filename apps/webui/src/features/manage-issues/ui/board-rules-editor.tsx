import type { BoardRule, BoardRuleInput, BoardStatus } from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { type Agent } from '@/entities/agent';
import { useIssueBoardStore } from '@/entities/issue';
import {
  executionProfilesQuery,
  LOCAL_EXECUTION_PROFILE_ID,
  removeBoardRule,
  reorderBoardRules,
  saveBoardRule,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { sortedStatuses } from '../model/board-columns';
import { errorMessage } from '../model/issue-errors';
import { RuleRow } from './board-rule-row';

export function BoardRulesEditor({
  orgId,
  boardId,
  rules,
  statuses,
  agents,
  labels,
}: {
  orgId: string;
  boardId: string;
  rules: BoardRule[];
  statuses: BoardStatus[];
  agents: Agent[];
  labels: IssueLabelRecord[];
}) {
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const upsertBoard = useIssueBoardStore((state) => state.upsert);
  const ordered = [...rules].sort((a, b) => a.position - b.position);

  const persist = async (input: BoardRuleInput & { id?: string }): Promise<void> => {
    try {
      const board = await saveBoardRule(orgId, boardId, input);
      upsertBoard(board);
    } catch (error) {
      toast.add({ title: 'Rule save failed', description: errorMessage(error), type: 'error' });
    }
  };

  const addRule = (): void => {
    const statusKey = sortedStatuses(statuses)[0]?.key ?? '';
    void persist({
      trigger: statusKey ? { type: 'status_entered', statusKey } : { type: 'issue_created' },
      conditions: [],
      actions: agents[0]
        ? [{ type: 'assign_agent', agentId: agents[0].id }]
        : [{ type: 'notify_owner', text: 'Rule fired' }],
      position: ordered.length,
      enabled: true,
    });
  };

  const patchRule = (rule: BoardRule, patch: Partial<BoardRuleInput>): void => {
    void persist({
      id: rule.id,
      trigger: patch.trigger ?? rule.trigger,
      conditions: patch.conditions ?? rule.conditions,
      actions: patch.actions ?? rule.actions,
      position: patch.position ?? rule.position,
      enabled: patch.enabled ?? rule.enabled,
    });
  };

  const removeRule = (rule: BoardRule): void => {
    void removeBoardRule(orgId, boardId, rule.id)
      .then(upsertBoard)
      .catch((error) => {
        toast.add({ title: 'Rule delete failed', description: errorMessage(error), type: 'error' });
      });
  };

  const moveRule = (rule: BoardRule, delta: number): void => {
    const index = ordered.indexOf(rule);
    const target = index + delta;
    if (target < 0 || target >= ordered.length) {
      return;
    }
    const ids = ordered.map((item) => item.id);
    const [movedId] = ids.splice(index, 1);
    if (!movedId) {
      return;
    }
    ids.splice(target, 0, movedId);
    void reorderBoardRules(orgId, boardId, ids)
      .then(upsertBoard)
      .catch((error) => {
        toast.add({ title: 'Rule move failed', description: errorMessage(error), type: 'error' });
      });
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Rules run on issue creation or when an issue enters a status. Conditions are AND; actions
        run in order. Changes save immediately.
      </p>
      {ordered.map((rule) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          orgId={orgId}
          statuses={statuses}
          agents={agents}
          labels={labels}
          profiles={profiles?.items ?? []}
          defaultProfileId={profiles?.defaultProfileId ?? LOCAL_EXECUTION_PROFILE_ID}
          onPatch={(patch) => patchRule(rule, patch)}
          onRemove={() => removeRule(rule)}
          onMove={(delta) => moveRule(rule, delta)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={addRule}
        data-testid="board-rule-add"
      >
        <PlusIcon className="size-3" />
        Add rule
      </Button>
    </div>
  );
}
