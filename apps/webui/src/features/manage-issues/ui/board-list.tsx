import type { BoardStatus, IssueLabelRecord, IssueRecord } from '@harnesys/studio-shared';
import { CheckIcon, MoreHorizontalIcon } from 'lucide-react';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { issueCode, statusOf } from '../model/board-columns';
import { confirmDeleteIssue } from '../model/issue-dialogs';
import { useIssueDrawerStore } from '../model/issue-drawer.store';
import { ISSUE_PRIORITY_OPTIONS, issueTypeIcon, priorityMeta } from '../model/issue-meta';
import type { IssueSortField } from '../model/issue-view.store';
import { deleteIssue, setIssuePriority } from '../model/issues';
import { useSourceFileDrop } from '../model/use-source-file-drop';

const SORTABLE: { field: IssueSortField; label: string; className?: string }[] = [
  { field: 'createdAt', label: 'CODE', className: 'w-28' },
  { field: 'title', label: 'TITLE' },
  { field: 'status', label: 'STATUS', className: 'w-36' },
  { field: 'priority', label: 'PRIORITY', className: 'w-28' },
];

export function BoardList({
  issues,
  statuses,
  labels,
  agents,
  orgId,
  sortField,
  sortOrder,
  onToggleSort,
}: {
  issues: IssueRecord[];
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
  agents: Agent[];
  orgId: string;
  sortField: IssueSortField;
  sortOrder: 'asc' | 'desc';
  onToggleSort: (field: IssueSortField) => void;
}) {
  const openDrawer = useIssueDrawerStore((state) => state.openIssue);
  return (
    <div className="rounded-xl border bg-sidebar/30 p-3">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            {SORTABLE.map((column) => (
              <th key={column.field} className={cn('px-2 py-2 font-semibold', column.className)}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 hover:text-foreground"
                  data-testid={`issue-list-sort-${column.field}`}
                  onClick={() => onToggleSort(column.field)}
                >
                  {column.label}
                  {sortField === column.field ? (
                    <span className="text-[9px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  ) : null}
                </button>
              </th>
            ))}
            <th className="w-32 px-2 py-2 font-semibold">TYPE</th>
            <th className="w-40 px-2 py-2 font-semibold">LABELS</th>
            <th className="w-40 px-2 py-2 font-semibold">ASSIGNEE</th>
            <th className="w-16 px-2 py-2 text-right font-semibold">···</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              statuses={statuses}
              labels={labels}
              agents={agents}
              orgId={orgId}
              onOpen={() => openDrawer(issue.id)}
            />
          ))}
          {issues.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="h-24 px-2 text-center text-muted-foreground text-sm italic"
              >
                No issues found
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function IssueRow({
  issue,
  statuses,
  labels,
  agents,
  orgId,
  onOpen,
}: {
  issue: IssueRecord;
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
  agents: Agent[];
  orgId: string;
  onOpen: () => void;
}) {
  const assignee = issue.assigneeAgentId
    ? (agents.find((agent) => agent.id === issue.assigneeAgentId) ?? null)
    : null;
  const status = statusOf(statuses, issue.statusKey);
  const priority = priorityMeta(issue.priority);
  const cardLabels = labels.filter((label) => issue.labels.includes(label.id));
  const sourceDrop = useSourceFileDrop(orgId, issue.id);
  return (
    <tr
      tabIndex={0}
      aria-label={issue.title}
      className={cn(
        'cursor-pointer border-t outline-none hover:bg-accent/30 focus-visible:bg-accent/30',
        sourceDrop.dropping && 'bg-live/15 ring-1 ring-live ring-inset',
      )}
      data-testid={`issue-row-${issue.id}`}
      onDragOver={sourceDrop.onDragOver}
      onDragLeave={sourceDrop.onDragLeave}
      onDrop={sourceDrop.onDrop}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <td className="px-2 py-2 font-mono font-semibold text-muted-foreground text-xs">
        {issueCode(issue.id)}
      </td>
      <td className="max-w-sm truncate px-2 py-2 font-medium text-foreground text-sm">
        {issue.title}
      </td>
      <td className="px-2 py-2">
        <Badge variant="outline" className="w-fit gap-1.5 border-none text-[10px] capitalize">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: status?.color ?? '#94a3b8' }}
          />
          {status?.label ?? issue.statusKey}
        </Badge>
      </td>
      <td className="px-2 py-2">
        <Badge variant="outline" className="w-fit gap-1.5 border-none text-[10px]">
          <span className={cn('size-1.5 rounded-full', priority.dot)} />
          {priority.label}
        </Badge>
      </td>
      <td className="px-2 py-2 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          {issueTypeIcon(issue.type)}
          {issue.type}
        </span>
      </td>
      <td className="px-2 py-2">
        <div className="flex max-w-[200px] flex-wrap gap-1">
          {cardLabels.map((label) => (
            <Badge
              key={label.id}
              className="inline-flex shrink-0 select-none items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium text-[9px]"
              style={{
                backgroundColor: `${label.color}1f`,
                borderColor: `${label.color}33`,
                color: label.color,
              }}
            >
              <span
                className="size-1 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.title}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-2 py-2">
        {assignee ? (
          <span className="flex items-center gap-2">
            <AgentRecordAvatar agent={assignee} title={assignee.name} />
            <span className="max-w-[120px] truncate text-muted-foreground text-xs">
              {assignee.name}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs italic">Unassigned</span>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <RowMenu issue={issue} orgId={orgId} />
      </td>
    </tr>
  );
}

function RowMenu({ issue, orgId }: { issue: IssueRecord; orgId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontalIcon className="size-4" />
        <span className="sr-only">Issue actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">Priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ISSUE_PRIORITY_OPTIONS.map((value) => {
              const meta = priorityMeta(value);
              return (
                <DropdownMenuItem
                  key={value}
                  className="flex items-center gap-2 text-xs"
                  onClick={() => {
                    void setIssuePriority(orgId, issue.id, value);
                  }}
                >
                  {meta.icon}
                  <span className="flex-1">{meta.label}</span>
                  {issue.priority === value ? <CheckIcon className="size-3 text-primary" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="text-xs"
          onClick={() => {
            void confirmDeleteIssue(issue).then((confirmed) => {
              if (confirmed) {
                void deleteIssue(orgId, issue.id);
              }
            });
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
