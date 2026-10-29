import type { IssueRecord, IssueType } from '@harnesys/studio-shared';
import { ISSUE_TYPES } from '@harnesys/studio-shared';
import { CheckSquareIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueBoardStore } from '@/entities/issue';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { issueCode, statusOf } from '../../model/board-columns';
import { useIssueDrawerStore } from '../../model/issue-drawer.store';
import {
  ISSUE_PRIORITY_META,
  ISSUE_PRIORITY_OPTIONS,
  issueTypeIcon,
  priorityMeta,
} from '../../model/issue-meta';
import { createIssueFromDraft } from '../../model/issues';

export function IssueSubtasks({
  orgId,
  issue,
  subtasks,
  onChanged,
}: {
  orgId: string;
  issue: IssueRecord;
  subtasks: IssueRecord[];
  onChanged: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  const statuses = useIssueBoardStore((state) => state.boardById(issue.boardId)?.statuses ?? []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
          <CheckSquareIcon className="size-4 text-muted-foreground" />
          Subtasks
        </h4>
        {!isCreating ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setIsCreating(true)}
          >
            <PlusIcon className="size-3.5" />
            Add Subtask
          </Button>
        ) : null}
      </div>
      {isCreating ? (
        <SubtaskCreateForm
          orgId={orgId}
          parent={issue}
          onDone={() => {
            setIsCreating(false);
            onChanged();
          }}
        />
      ) : null}
      {subtasks.length === 0 && !isCreating ? (
        <p className="text-muted-foreground text-xs italic">No subtasks created yet.</p>
      ) : (
        <div className="space-y-1.5">
          {subtasks.map((sub) => (
            <button
              key={sub.id}
              type="button"
              className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-all hover:bg-accent/40"
              onClick={() => openIssue(sub.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-muted-foreground">{issueTypeIcon(sub.type)}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {issueCode(sub.id)}
                </span>
                <span className="truncate font-medium text-foreground group-hover:text-primary">
                  {sub.title}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    backgroundColor: statusOf(statuses, sub.statusKey)?.color ?? '#94a3b8',
                  }}
                />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {statusOf(statuses, sub.statusKey)?.label ?? sub.statusKey}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskCreateForm({
  orgId,
  parent,
  onDone,
}: {
  orgId: string;
  parent: IssueRecord;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<IssueType>('task');
  const [priority, setPriority] = useState(2);
  const [pending, setPending] = useState(false);

  const handleCreate = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed || pending) {
      return;
    }
    setPending(true);
    const created = await createIssueFromDraft(orgId, {
      title: trimmed,
      description: '',
      statusKey: parent.statusKey,
      priority,
      type,
      labels: [],
      assigneeAgentId: '',
      dueDate: null,
      sourceId: parent.sourceId ?? '',
      branch: null,
      boardId: parent.boardId,
      parentIssueId: parent.id,
    });
    setPending(false);
    if (created) {
      onDone();
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1">
        <span className="text-[10px] text-muted-foreground">Title *</span>
        <Input
          placeholder="Subtask title..."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreate();
            }
          }}
          className="h-8 text-xs"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SubtaskSelect
          label="Type"
          items={ISSUE_TYPES.map((item) => ({ value: item, label: item }))}
          value={type}
          onValueChange={(value) => setType(value as IssueType)}
          renderIcon={(value) => issueTypeIcon(value as IssueType)}
        />
        <SubtaskSelect
          label="Priority"
          items={ISSUE_PRIORITY_OPTIONS.map((item) => ({
            value: String(item),
            label: ISSUE_PRIORITY_META[item].label,
          }))}
          value={String(priority)}
          onValueChange={(value) => setPriority(Number(value))}
          renderIcon={(value) => priorityMeta(Number(value)).icon}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="xs" className="h-7 text-xs" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          className="h-7 text-xs"
          disabled={!title.trim() || pending}
          onClick={() => void handleCreate()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function SubtaskSelect({
  label,
  items,
  value,
  onValueChange,
  renderIcon,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  renderIcon: (value: string) => React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => onValueChange(String(next ?? ''))}
      >
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              <span className="flex items-center gap-1.5">
                {renderIcon(item.value)}
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
