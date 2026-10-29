import type { BoardStatus, IssueLabelRecord, IssueRecord } from '@harnesys/studio-shared';
import {
  CalendarIcon,
  CircleSlashIcon,
  FolderIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  SquareKanbanIcon,
} from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatShortDate } from '@/shared/lib/format-clock';
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
import {
  ISSUE_PRIORITY_OPTIONS,
  issueTypeIcon,
  priorityMeta,
  toDateInputValue,
} from '../model/issue-meta';
import { deleteIssue, setIssuePriority } from '../model/issues';
import { useOpenIssueThread } from '../model/use-open-issue-thread';
import { useSourceFileDrop } from '../model/use-source-file-drop';

export function IssueCard({
  issue,
  statuses,
  labels,
  agents,
  orgId,
  ruleMatched,
  onDragStart,
}: {
  issue: IssueRecord;
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
  agents: Agent[];
  orgId: string;
  ruleMatched: boolean;
  onDragStart: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const assignee = issue.assigneeAgentId
    ? (agents.find((agent) => agent.id === issue.assigneeAgentId) ?? null)
    : null;
  const thread = useThreadStore((state) => state.items.find((item) => item.issueId === issue.id));
  const running = useSessionStore((s) => Boolean(thread && s.activeRuns[thread.id]));
  const openIssueThread = useOpenIssueThread();
  const openDrawer = useIssueDrawerStore((state) => state.openIssue);
  const priority = priorityMeta(issue.priority);
  const status = statusOf(statuses, issue.statusKey);
  const cardLabels = labels.filter((label) => issue.labels.includes(label.id));
  const sourceDrop = useSourceFileDrop(orgId, issue.id);
  return (
    <li
      className={cn(
        'group/card relative rounded-lg transition-shadow',
        sourceDrop.dropping && 'bg-live/10 ring-1 ring-live',
      )}
      data-testid={`issue-card-${issue.id}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', `issue:${issue.id}`);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={(event) => {
        event.dataTransfer.clearData();
      }}
      onDragOver={sourceDrop.onDragOver}
      onDragLeave={sourceDrop.onDragLeave}
      onDrop={sourceDrop.onDrop}
    >
      <button
        type="button"
        className={cn(
          'w-full cursor-pointer rounded-lg border bg-card p-3 text-left shadow-xs transition-all duration-150 hover:bg-accent/30',
          running && 'border-live/60 bg-live/5 ring-1 ring-live',
        )}
        data-testid={`issue-card-open-${issue.id}`}
        data-running={running ? 'true' : 'false'}
        onClick={(event) => {
          const threadChip = (event.target as HTMLElement).closest('[data-thread-chip]');
          if (thread && threadChip) {
            openIssueThread(thread.id, thread.agentId);
            return;
          }
          openDrawer(issue.id);
        }}
      >
        <span className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{issueTypeIcon(issue.type)}</span>
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            {issueCode(issue.id)}
          </span>
          <span
            className={cn(
              'ml-auto size-2 shrink-0 rounded-full opacity-80 transition-opacity group-hover/card:opacity-0',
              priority.dot,
            )}
            title={`Priority: ${priority.label}`}
          />
          <span
            className="ml-1 size-1.5 shrink-0 rounded-full transition-opacity group-hover/card:opacity-0"
            style={{ backgroundColor: status?.color ?? '#94a3b8' }}
            title={status?.label ?? issue.statusKey}
          />
        </span>
        <span className="wrap-break-word mt-1.5 block font-medium text-foreground text-sm leading-snug">
          {issue.title}
        </span>
        {cardLabels.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {cardLabels.map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="gap-1 rounded-md border-none px-1.5 py-0 font-medium text-[10px]"
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
          </span>
        ) : null}
        <span className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <AssigneeMark assignee={assignee} />
            {!ruleMatched && status?.category === 'started' ? (
              <span
                className="flex shrink-0"
                title="No rule for this status — agent won't start automatically"
              >
                <CircleSlashIcon
                  className="size-3.5 shrink-0 text-status-warn"
                  data-testid={`issue-no-rule-${issue.id}`}
                />
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {issue.sourceId ? (
              <span
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                title="Source linked"
                data-testid={`issue-vcs-mark-${issue.id}`}
              >
                <FolderIcon className="size-3" />
              </span>
            ) : null}
            {issue.dueDate ? (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <CalendarIcon className="size-3" />
                {formatShortDate(toDateInputValue(issue.dueDate), timeZone)}
              </span>
            ) : null}
            {issue.attachmentCount ? (
              <span
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                title={`Attachments: ${issue.attachmentCount}`}
              >
                <PaperclipIcon className="size-3" />
                {issue.attachmentCount}
              </span>
            ) : null}
            {issue.commentCount ? (
              <span
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                title={`Comments: ${issue.commentCount}`}
                data-testid={`issue-comments-${issue.id}`}
              >
                <MessageSquareIcon className="size-3" />
                {issue.commentCount}
              </span>
            ) : null}
            {thread ? (
              <span
                data-thread-chip=""
                className="flex shrink-0 cursor-pointer items-center"
                title="Open working thread"
                data-testid={`issue-thread-${issue.id}`}
              >
                <SquareKanbanIcon className="size-3 text-status-warn/90" />
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[data-open]]:opacity-100">
        <CardMenu issue={issue} orgId={orgId} />
      </span>
    </li>
  );
}

function AssigneeMark({ assignee }: { assignee: Agent | null }) {
  if (!assignee) {
    return <span className="text-[10px] text-muted-foreground italic">Unassigned</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={assignee.name}>
      <AgentRecordAvatar agent={assignee} />
      <span className="max-w-[90px] truncate text-[11px] text-muted-foreground">
        {assignee.name}
      </span>
    </span>
  );
}

function CardMenu({ issue, orgId }: { issue: IssueRecord; orgId: string }) {
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
        <MoreHorizontalIcon className="size-3.5" />
        <span className="sr-only">Issue actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
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
                  {meta.label}
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
