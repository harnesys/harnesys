import type { BoardRule, BoardRuleInput, BoardRulePreview, BoardStatus } from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, CircleAlertIcon, FlaskConicalIcon, PlusIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import { useIssueBoardStore, useIssueStore } from '@/entities/issue';
import {
  executionProfilesQuery,
  LOCAL_EXECUTION_PROFILE_ID,
  previewBoardRules,
  removeBoardRule,
  reorderBoardRules,
  saveBoardRule,
} from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
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
  statusScope,
}: {
  orgId: string;
  boardId: string;
  rules: BoardRule[];
  statuses: BoardStatus[];
  agents: Agent[];
  labels: IssueLabelRecord[];
  statusScope?: string;
}) {
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const upsertBoard = useIssueBoardStore((state) => state.upsert);
  const [previewIssueId, setPreviewIssueId] = useState('');
  const boardIssues = useIssueStore(
    useShallow((state) =>
      state.items.filter(
        (issue) => issue.boardId === boardId && (!statusScope || issue.statusKey === statusScope),
      ),
    ),
  );
  const previewQuery = useQuery({
    queryKey: ['board-rule-preview', orgId, boardId, previewIssueId, rules],
    queryFn: () => previewBoardRules(orgId, boardId, previewIssueId),
    enabled: previewIssueId !== '',
  });
  const ordered = [...rules].sort((a, b) => a.position - b.position);
  const visible = statusScope
    ? ordered.filter(
        (rule) => rule.trigger.type === 'status_entered' && rule.trigger.statusKey === statusScope,
      )
    : ordered;
  const preview = previewQuery.data;
  const matchedIds = new Set(preview?.matchedRuleIds ?? []);
  const previewIssue = boardIssues.find((issue) => issue.id === previewIssueId);

  const persist = async (input: BoardRuleInput & { id?: string }): Promise<void> => {
    try {
      const board = await saveBoardRule(orgId, boardId, input);
      upsertBoard(board);
    } catch (error) {
      toast.add({ title: 'Rule save failed', description: errorMessage(error), type: 'error' });
    }
  };

  const addRule = (): void => {
    const statusKey = statusScope ?? sortedStatuses(statuses)[0]?.key ?? '';
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
    const index = visible.indexOf(rule);
    const neighbor = visible[index + delta];
    if (index === -1 || !neighbor) {
      return;
    }
    const ids = ordered.map((item) => item.id);
    const from = ids.indexOf(rule.id);
    const to = ids.indexOf(neighbor.id);
    if (from === -1 || to === -1) {
      return;
    }
    ids[from] = neighbor.id;
    ids[to] = rule.id;
    void reorderBoardRules(orgId, boardId, ids)
      .then(upsertBoard)
      .catch((error) => {
        toast.add({ title: 'Rule move failed', description: errorMessage(error), type: 'error' });
      });
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {statusScope
          ? 'Rules run top to bottom when an issue enters this status. The first one that matches wins. Click a rule to edit it.'
          : 'Rules run top to bottom when an issue is created or enters a status. The first one that matches wins. Click a rule to edit it.'}
      </p>
      <div className="rounded-lg border bg-muted/30 p-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <FlaskConicalIcon className="size-3.5 text-muted-foreground" />
          <p className="font-medium text-xs">Test on an issue</p>
        </div>
        <Select
          items={boardIssues.map((issue) => ({ value: issue.id, label: issue.title }))}
          value={previewIssueId || null}
          onValueChange={(value) => setPreviewIssueId(value ? String(value) : '')}
        >
          <SelectTrigger size="sm" className="w-full text-xs" data-testid="board-rule-preview-pick">
            <SelectValue placeholder="Pick an issue to see what happens..." />
          </SelectTrigger>
          <SelectContent>
            {boardIssues.map((issue) => (
              <SelectItem key={issue.id} value={issue.id}>
                {issue.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {boardIssues.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {statusScope
              ? 'No issues in this column to test with yet.'
              : 'No issues on this board to test with yet.'}
          </p>
        ) : null}
        {previewIssueId ? (
          <RulePreviewSummary
            pending={previewQuery.isPending}
            error={previewQuery.isError}
            preview={preview}
            issueStatusKey={previewIssue?.statusKey ?? ''}
            agents={agents}
            statuses={statuses}
            labels={labels}
          />
        ) : null}
      </div>
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-5 text-center">
          <p className="font-medium text-xs">No rules yet</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {statusScope
              ? 'Nothing runs when an issue enters this status.'
              : 'Nothing runs on this board until you add a rule.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              index={index}
              orgId={orgId}
              statuses={statuses}
              agents={agents}
              labels={labels}
              profiles={profiles?.items ?? []}
              defaultProfileId={profiles?.defaultProfileId ?? LOCAL_EXECUTION_PROFILE_ID}
              showTrigger={!statusScope}
              highlight={matchedIds.has(rule.id)}
              initialOpen={visible.length === 1}
              onPatch={(patch) => patchRule(rule, patch)}
              onRemove={() => removeRule(rule)}
              onMove={(delta) => moveRule(rule, delta)}
            />
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full justify-center gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
        onClick={addRule}
        data-testid="board-rule-add"
      >
        <PlusIcon className="size-3.5" />
        Add rule
      </Button>
    </div>
  );
}

function RulePreviewSummary({
  pending,
  error,
  preview,
  issueStatusKey,
  agents,
  statuses,
  labels,
}: {
  pending: boolean;
  error: boolean;
  preview: BoardRulePreview | undefined;
  issueStatusKey: string;
  agents: Agent[];
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
}) {
  if (pending) {
    return <p className="mt-2 text-muted-foreground text-xs">Testing...</p>;
  }
  if (error || !preview) {
    return <p className="mt-2 text-destructive text-xs">Could not run the test.</p>;
  }
  const agent = preview.agentId ? agents.find((item) => item.id === preview.agentId) : undefined;
  const status = statuses.find((item) => item.key === preview.finalStatusKey);
  const moves = status && preview.finalStatusKey !== issueStatusKey ? status : undefined;
  const labelTitles = (ids: string[]): string =>
    ids.map((id) => labels.find((item) => item.id === id)?.title ?? 'label').join(', ');
  const matched = preview.matchedRuleIds.length;
  return (
    <div
      className="mt-2 space-y-1.5 rounded-md border bg-background p-2.5"
      data-testid="board-rule-preview-result"
    >
      <ResultRow label="Assignee">
        {agent ? (
          <span className="flex items-center gap-1.5">
            <AgentRecordAvatar agent={agent} />
            {agent.name}
          </span>
        ) : (
          <span className="text-muted-foreground">No one</span>
        )}
      </ResultRow>
      {moves ? <ResultRow label="Moves to">{moves.label}</ResultRow> : null}
      {preview.addLabelIds.length > 0 ? (
        <ResultRow label="Adds label">{labelTitles(preview.addLabelIds)}</ResultRow>
      ) : null}
      {preview.removeLabelIds.length > 0 ? (
        <ResultRow label="Removes label">{labelTitles(preview.removeLabelIds)}</ResultRow>
      ) : null}
      {preview.unassign ? <ResultRow label="Assignee">Cleared</ResultRow> : null}
      {preview.notifications.map((text, index) => (
        <ResultRow key={`${text}-${index}`} label="Notifies">
          {text}
        </ResultRow>
      ))}
      <div
        className={cn(
          'flex items-center gap-1.5 border-t pt-1.5 text-muted-foreground',
          matched === 0 && 'text-status-warn',
        )}
      >
        {matched === 0 ? (
          <CircleAlertIcon className="size-3.5 shrink-0" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0" />
        )}
        <span>
          {matched === 0
            ? 'No rule matches this issue.'
            : `${matched} ${matched === 1 ? 'rule' : 'rules'} matched.`}
          {preview.skippedRules.length > 0
            ? ` ${preview.skippedRules.length} skipped (missing label or agent).`
            : ''}
          {preview.stopped ? ' Processing stopped here.' : ''}
        </span>
      </div>
    </div>
  );
}

function ResultRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
