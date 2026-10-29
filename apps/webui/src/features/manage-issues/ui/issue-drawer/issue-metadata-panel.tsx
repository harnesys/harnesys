import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { ISSUE_TYPES, type IssueType } from '@harnesys/studio-shared';
import { UserRoundIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import type { IssueBoardRecord } from '@/shared/api/issues';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { formatFullDate } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { sortedStatuses, statusOf } from '../../model/board-columns';
import { resolveBoardIcon } from '../../model/board-icons';
import type { IssueFormDraft } from '../../model/issue-draft';
import {
  ISSUE_PRIORITY_META,
  ISSUE_PRIORITY_OPTIONS,
  issueTypeIcon,
  priorityMeta,
} from '../../model/issue-meta';
import { IssueCreateSourceFields } from './issue-create-source-fields';
import { IssueDueDate } from './issue-due-date';
import { IssueFireTrail } from './issue-fire-trail';
import { IssueLabelField } from './issue-label-input';

const NONE = '__none__';

export interface MetadataPanelProps {
  orgId: string;
  draft: IssueFormDraft;
  issue: IssueRecord | null;
  boardId: string;
  agents: Agent[];
  boards: IssueBoardRecord[];
  statuses: BoardStatus[];
  onDraftChange: (draft: IssueFormDraft) => void;
  onStatusChange: (statusKey: string) => void;
  onAssigneeChange: (agentId: string | null) => void;
  onBoardChange: (boardId: string) => void;
}

function MetaField({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium text-muted-foreground text-xs">{title}</Label>
      {children}
    </div>
  );
}

export function IssueMetadataPanel({
  orgId,
  draft,
  issue,
  boardId,
  agents,
  boards,
  statuses,
  onDraftChange,
  onStatusChange,
  onAssigneeChange,
  onBoardChange,
}: MetadataPanelProps) {
  const timeZone = useOrgTimeZone();
  const isCreateMode = !issue;
  const statusValue: string = draft.statusKey;
  const assignableAgents = agents.filter((agent) => !agent.parentId);
  return (
    <div className="w-full shrink-0 space-y-5 overflow-y-auto border-t p-6 text-xs md:w-64 md:border-t-0">
      <MetaField title="Status">
        <Select
          items={sortedStatuses(statuses).map((item) => ({
            value: item.key,
            label: item.label,
          }))}
          value={statusValue}
          onValueChange={(value) => value && onStatusChange(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: unknown) => {
                const current = statusOf(statuses, String(value));
                return (
                  <SelectChip
                    icon={
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: current?.color ?? '#94a3b8' }}
                      />
                    }
                    label={current?.label ?? String(value)}
                  />
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sortedStatuses(statuses).map((status) => (
              <SelectItem key={status.key} value={status.key}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: status.color ?? '#94a3b8' }}
                  />
                  {status.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MetaField>

      <MetaField title="Assignee">
        <Select
          items={[
            { value: NONE, label: 'Unassigned' },
            ...assignableAgents.map((agent) => ({ value: agent.id, label: agent.name })),
          ]}
          value={draft.assigneeAgentId || NONE}
          onValueChange={(value) =>
            onAssigneeChange(!value || value === NONE ? null : String(value))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Unassigned">
              {(value: unknown) => {
                const agent = assignableAgents.find((item) => item.id === value);
                return (
                  <SelectChip
                    icon={<AssigneeMark agent={agent ?? null} />}
                    label={agent?.name ?? 'Unassigned'}
                  />
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="flex items-center gap-2">
                <AssigneeMark agent={null} />
                Unassigned
              </span>
            </SelectItem>
            {assignableAgents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <span className="flex items-center gap-2">
                  <AssigneeMark agent={agent} />
                  {agent.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MetaField>

      <MetaField title="Board">
        <Select
          items={boards.map((board) => ({ value: board.id, label: board.name }))}
          value={issue?.boardId ?? boardId}
          onValueChange={(value) => value && onBoardChange(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select board">
              {(value: unknown) => {
                const board = boards.find((item) => item.id === value);
                if (!board) {
                  return 'Select board';
                }
                const BoardIcon = resolveBoardIcon(board.icon);
                return (
                  <SelectChip
                    icon={
                      <span
                        className={cn(
                          'inline-flex size-4 shrink-0 items-center justify-center rounded',
                          entityColorTintClass(board.color),
                        )}
                      >
                        <BoardIcon className="size-3" />
                      </span>
                    }
                    label={board.name}
                  />
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MetaField>

      {isCreateMode ? (
        <IssueCreateSourceFields orgId={orgId} draft={draft} onDraftChange={onDraftChange} />
      ) : null}

      <MetaField title="Type">
        <Select
          items={ISSUE_TYPES.map((item) => ({ value: item, label: item }))}
          value={draft.type}
          onValueChange={(value) => onDraftChange({ ...draft, type: value as IssueType })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: unknown) => (
                <SelectChip icon={issueTypeIcon(value as IssueType)} label={String(value)} />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ISSUE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                <span className="flex items-center gap-2">
                  {issueTypeIcon(type)}
                  {type}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MetaField>

      <MetaField title="Priority">
        <Select
          items={ISSUE_PRIORITY_OPTIONS.map((item) => ({
            value: String(item),
            label: ISSUE_PRIORITY_META[item].label,
          }))}
          value={String(draft.priority)}
          onValueChange={(value) => onDraftChange({ ...draft, priority: Number(value) })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: unknown) => {
                const meta = priorityMeta(Number(value));
                return <SelectChip icon={meta.icon} label={meta.label} />;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ISSUE_PRIORITY_OPTIONS.map((value) => {
              const meta = priorityMeta(value);
              return (
                <SelectItem key={value} value={String(value)}>
                  <span className="flex items-center gap-2">
                    {meta.icon}
                    {meta.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </MetaField>

      <MetaField title="Due Date">
        <IssueDueDate
          value={draft.dueDate}
          onChange={(dueDate) => onDraftChange({ ...draft, dueDate })}
        />
      </MetaField>

      <IssueLabelField
        orgId={orgId}
        selected={draft.labels}
        onChange={(labels) => onDraftChange({ ...draft, labels })}
      />

      {!isCreateMode && issue ? (
        <div className="space-y-2.5 border-t pt-4 text-[11px] text-muted-foreground">
          <ReadOnlyRow label="Created" value={formatFullDate(issue.createdAt, timeZone)} />
          <ReadOnlyRow label="Updated" value={formatFullDate(issue.updatedAt, timeZone)} />
          {issue.closedAt ? (
            <ReadOnlyRow label="Closed" value={formatFullDate(issue.closedAt, timeZone)} />
          ) : null}
        </div>
      ) : null}

      {issue && issue.fireTrail.length > 0 ? (
        <MetaField title="Fires">
          <IssueFireTrail orgId={orgId} issue={issue} agents={agents} statuses={statuses} />
        </MetaField>
      ) : null}
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function SelectChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function AssigneeMark({ agent }: { agent: Agent | null }) {
  if (!agent) {
    return <UserRoundIcon className="size-4 shrink-0 text-muted-foreground/40" />;
  }
  return <AgentRecordAvatar agent={agent} />;
}
