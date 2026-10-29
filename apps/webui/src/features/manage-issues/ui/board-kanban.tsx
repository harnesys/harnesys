import type { BoardRuleRecord, BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import { sortedStatuses } from '../model/board-columns';
import { BoardColumn } from './board-column';

export function BoardKanban({
  boardId,
  issues,
  statuses,
  rules,
  agents,
  orgId,
  hiddenStatuses,
}: {
  boardId: string;
  issues: IssueRecord[];
  statuses: BoardStatus[];
  rules: BoardRuleRecord[];
  agents: Agent[];
  orgId: string;
  hiddenStatuses: string[];
}) {
  const columns = sortedStatuses(statuses).filter((status) => !hiddenStatuses.includes(status.key));
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-3">
      {columns.map((status) => (
        <BoardColumn
          key={status.key}
          boardId={boardId}
          status={status}
          issues={issues.filter((issue) => issue.statusKey === status.key)}
          rules={rules}
          statuses={statuses}
          agents={agents}
          orgId={orgId}
        />
      ))}
    </div>
  );
}
