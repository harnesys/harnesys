import type { BoardRuleRecord, BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { CheckSquareIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import { useIssueLabelStore } from '@/entities/issue';
import { MOVE_DRAG_MIME } from '@/features/move-project-files';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  canQuickCreate,
  columnDropClassName,
  issueHasRule,
  parseIssueCardDragId,
  rulesForStatus,
} from '../model/board-columns';
import { useIssueDrawerStore } from '../model/issue-drawer.store';
import { moveIssueStatus } from '../model/issues';
import { IssueCard } from './issue-card';

export function BoardColumn({
  boardId,
  status,
  issues,
  rules,
  statuses,
  agents,
  orgId,
}: {
  boardId: string;
  status: BoardStatus;
  issues: IssueRecord[];
  rules: BoardRuleRecord[];
  statuses: BoardStatus[];
  agents: Agent[];
  orgId: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const labels = useIssueLabelStore((state) => state.items);
  const startCreate = useIssueDrawerStore((state) => state.startCreate);
  const quick = canQuickCreate(status);
  return (
    <section
      aria-label={`${status.label} column`}
      className={cn(
        'flex min-h-0 w-72 shrink-0 flex-col rounded-xl border bg-sidebar/25',
        columnDropClassName(dragOver),
      )}
      data-testid={`issue-column-${status.key}`}
      data-board={boardId}
      onDragOver={(event) => {
        if (
          !event.dataTransfer.types.includes('text/plain') ||
          event.dataTransfer.types.includes(MOVE_DRAG_MIME)
        ) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) {
          return;
        }
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const issueId = parseIssueCardDragId(event.dataTransfer);
        if (!issueId || orgId === '') {
          return;
        }
        void moveIssueStatus(orgId, issueId, status.key);
      }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2 font-medium text-foreground text-xs uppercase tracking-wider">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: status.color ?? '#94a3b8' }}
          />
          {status.label}
          <span className="rounded bg-muted px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
            {issues.length}
          </span>
        </div>
        {quick ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
            title={`Create issue in ${status.label}`}
            data-testid={`issue-quick-create-${status.key}`}
            onClick={() => startCreate(boardId, status.key)}
          >
            <PlusIcon className="size-3.5" />
            <span className="sr-only">Add to {status.label}</span>
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-1 pb-6">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            statuses={statuses}
            labels={labels}
            agents={agents}
            orgId={orgId}
            ruleMatched={issueHasRule(rules, statuses, issue)}
            onDragStart={() => setDragOver(false)}
          />
        ))}
        {issues.length === 0 ? <EmptyColumn status={status} /> : null}
      </div>
      <ColumnRuleFooter rules={rules} statusKey={status.key} agents={agents} />
    </section>
  );
}

function EmptyColumn({ status }: { status: BoardStatus }) {
  return (
    <div className="flex min-h-[150px] select-none flex-col items-center justify-center rounded-lg border border-dashed px-4 py-10 text-center">
      <div className="mb-2 rounded-full border bg-muted/40 p-2 text-muted-foreground/50">
        <CheckSquareIcon className="size-4" />
      </div>
      <p className="font-medium text-muted-foreground text-xs">No issues</p>
      <p className="mt-0.5 max-w-[165px] text-[9px] text-muted-foreground/60 leading-normal">
        {status.category === 'finished'
          ? 'Tasks completed will appear here.'
          : 'Drag items here or create a new task.'}
      </p>
    </div>
  );
}

function ColumnRuleFooter({
  rules,
  statusKey,
  agents,
}: {
  rules: BoardRuleRecord[];
  statusKey: string;
  agents: Agent[];
}) {
  const labels = useIssueLabelStore((state) => state.items);
  const matched = rulesForStatus(rules, statusKey).filter((rule) =>
    rule.actions.some((action) => action.type === 'assign_agent'),
  );
  if (matched.length === 0) {
    return (
      <footer className="shrink-0 border-t px-3 py-1.5 text-[10px] text-muted-foreground/60 italic">
        No rule — nothing fires here
      </footer>
    );
  }
  return (
    <footer
      className="shrink-0 space-y-0.5 border-t px-3 py-1.5"
      data-testid={`column-rules-${statusKey}`}
    >
      {matched.map((rule) => {
        const labelIds = rule.conditions
          .filter((condition) => condition.type === 'has_label')
          .map((condition) => condition.labelId);
        return rule.actions
          .filter((action) => action.type === 'assign_agent')
          .map((action, index) => {
            if (action.type !== 'assign_agent') {
              return null;
            }
            const agent = agents.find((item) => item.id === action.agentId);
            const label =
              labelIds.length > 0 ? labels.find((item) => item.id === labelIds[0]) : undefined;
            return (
              <div
                key={`${rule.id}-${index}`}
                className="flex min-w-0 items-center gap-1.5 text-[10px]"
              >
                {label ? (
                  <>
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="max-w-20 truncate" title={label.title}>
                      {label.title}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground/70 italic">any label</span>
                )}
                <span className="shrink-0 text-muted-foreground/50">→</span>
                {agent ? <AgentRecordAvatar agent={agent} /> : null}
                <span
                  className="max-w-24 truncate font-medium text-muted-foreground"
                  title={agent?.name ?? action.agentId}
                >
                  {agent?.name ?? 'agent'}
                </span>
              </div>
            );
          });
      })}
    </footer>
  );
}
