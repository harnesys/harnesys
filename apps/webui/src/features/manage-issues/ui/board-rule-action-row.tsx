import type { BoardStatus, ExecutionProfileListItem, RuleAction } from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { sortedStatuses } from '../model/board-columns';
import { LabelPickerPopover, RuleLabelTriggerLabel } from './label-editor/label-picker';

const INHERIT_PROFILE = '__inherit__';

const ACTION_TYPE_ITEMS = [
  { value: 'assign_agent', label: 'Assign to' },
  { value: 'set_status', label: 'Move to' },
  { value: 'add_label', label: 'Add label' },
  { value: 'remove_label', label: 'Remove label' },
  { value: 'unassign', label: 'Clear assignee' },
  { value: 'notify_owner', label: 'Notify owner' },
  { value: 'stop', label: 'Stop here' },
];

const TYPE_TRIGGER_CLASS = 'w-36 shrink-0 rounded-[min(var(--radius-md),10px)]';
const FIELD_CLASS =
  'h-7 min-w-0 flex-1 rounded-[min(var(--radius-md),10px)] text-xs data-[size=sm]:rounded-[min(var(--radius-md),10px)]';

export function ActionRow({
  action,
  orgId,
  statuses,
  agents,
  profiles,
  defaultProfileId,
  labels,
  onPatch,
  onRemove,
}: {
  action: RuleAction;
  orgId: string;
  statuses: BoardStatus[];
  agents: Agent[];
  profiles: ExecutionProfileListItem[];
  defaultProfileId: string;
  labels: IssueLabelRecord[];
  onPatch: (action: RuleAction) => void;
  onRemove: () => void;
}) {
  const statusItems = sortedStatuses(statuses);
  const assignableAgents = agents.filter((agent) => !agent.parentId);
  const agent =
    action.type === 'assign_agent'
      ? assignableAgents.find((item) => item.id === action.agentId)
      : undefined;
  const inheritedProfileId = agent?.executionProfileId ?? defaultProfileId;
  const label =
    action.type === 'add_label' || action.type === 'remove_label'
      ? labels.find((item) => item.id === action.labelId)
      : undefined;

  return (
    <div className="flex items-center gap-2" data-testid={`rule-action-${action.type}`}>
      <Select
        items={ACTION_TYPE_ITEMS}
        value={action.type}
        onValueChange={(value) => {
          const next = switchActionType(String(value), assignableAgents, statusItems, labels);
          if (next) {
            onPatch(next);
          }
        }}
      >
        <SelectTrigger size="sm" className={TYPE_TRIGGER_CLASS}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_TYPE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {action.type === 'assign_agent' ? (
          <AssignControls
            action={action}
            agents={assignableAgents}
            profiles={profiles}
            inheritedProfileId={inheritedProfileId}
            onPatch={onPatch}
          />
        ) : null}
        {action.type === 'set_status' ? (
          <Select
            items={statusItems.map((item) => ({ value: item.key, label: item.label }))}
            value={action.statusKey}
            onValueChange={(value) =>
              value && onPatch({ type: 'set_status', statusKey: String(value) })
            }
          >
            <SelectTrigger size="sm" className={FIELD_CLASS}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {action.type === 'add_label' || action.type === 'remove_label' ? (
          <LabelPickerPopover
            orgId={orgId}
            selected={[action.labelId]}
            onChange={(selected) => {
              const labelId = selected[0];
              if (labelId) {
                onPatch({ type: action.type, labelId });
              }
            }}
            single
            manage
            align="start"
            trigger={{
              className:
                'flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent px-2 text-left text-xs text-foreground transition-colors hover:bg-muted/40',
              testId: `board-rule-action-label-${action.labelId}`,
              children: <RuleLabelTriggerLabel label={label} />,
            }}
          />
        ) : null}
        {action.type === 'notify_owner' ? (
          <Input
            value={action.text}
            onChange={(event) => onPatch({ type: 'notify_owner', text: event.target.value })}
            onBlur={(event) => {
              if (!event.target.value.trim()) {
                onPatch({ type: 'notify_owner', text: 'Rule fired' });
              }
            }}
            className="h-7 min-w-0 flex-1 text-xs"
            placeholder="Notification text"
          />
        ) : null}
        {action.type === 'stop' ? (
          <span className="min-w-0 flex-1 text-muted-foreground text-xs">
            Ignore every rule below this one
          </span>
        ) : null}
        {action.type === 'unassign' ? (
          <span className="min-w-0 flex-1 text-muted-foreground text-xs">
            Remove the current assignee
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove action"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function AssignControls({
  action,
  agents,
  profiles,
  inheritedProfileId,
  onPatch,
}: {
  action: Extract<RuleAction, { type: 'assign_agent' }>;
  agents: Agent[];
  profiles: ExecutionProfileListItem[];
  inheritedProfileId: string;
  onPatch: (action: RuleAction) => void;
}) {
  if (agents.length === 0) {
    return <span className="text-muted-foreground text-xs italic">No agents available</span>;
  }
  return (
    <>
      <Select
        items={agents.map((item) => ({ value: item.id, label: item.name }))}
        value={action.agentId}
        onValueChange={(value) => value && onPatch({ ...action, agentId: String(value) })}
      >
        <SelectTrigger size="sm" className={FIELD_CLASS}>
          <SelectValue placeholder="Agent">
            {(value: unknown) => {
              const selected = agents.find((item) => item.id === value);
              if (!selected) {
                return 'Select an agent';
              }
              return (
                <span className="flex min-w-0 items-center gap-1.5">
                  <AgentRecordAvatar agent={selected} />
                  <span className="truncate">{selected.name}</span>
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {agents.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <span className="flex items-center gap-1.5">
                <AgentRecordAvatar agent={item} />
                {item.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {profiles.length > 0 ? (
        <Select
          items={[
            { value: INHERIT_PROFILE, label: "Agent's default" },
            ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
          ]}
          value={action.executionProfileId ?? INHERIT_PROFILE}
          onValueChange={(value) =>
            onPatch({
              type: 'assign_agent',
              agentId: action.agentId,
              executionProfileId: !value || value === INHERIT_PROFILE ? undefined : String(value),
            })
          }
        >
          <SelectTrigger
            size="sm"
            className={cn(
              FIELD_CLASS,
              'flex-none basis-36 text-muted-foreground',
              action.executionProfileId && 'text-foreground',
            )}
          >
            <SelectValue placeholder="Agent's default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_PROFILE}>Agent&apos;s default</SelectItem>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
                {profile.id === inheritedProfileId ? ' (inherited)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </>
  );
}

export function ActionAdd({
  ruleId,
  agents,
  statuses,
  labels,
  onAdd,
}: {
  ruleId: string;
  agents: Agent[];
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
  onAdd: (action: RuleAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const assignableAgents = agents.filter((agent) => !agent.parentId);
  const statusItems = sortedStatuses(statuses);
  const disabled = new Set<string>();
  if (assignableAgents.length === 0) {
    disabled.add('assign_agent');
  }
  if (statusItems.length === 0) {
    disabled.add('set_status');
  }
  if (labels.length === 0) {
    disabled.add('add_label');
    disabled.add('remove_label');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid={`board-rule-action-add-${ruleId}`}
        className="flex h-7 w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border border-border border-dashed bg-transparent px-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted"
      >
        <PlusIcon className="size-3.5" />
        Add action
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-48 p-1.5">
        <PopoverTitle className="px-1.5 pt-0.5 pb-1 text-muted-foreground text-xs">
          Add action
        </PopoverTitle>
        <div className="flex flex-col gap-0.5">
          {ACTION_TYPE_ITEMS.map((item) => (
            <ActionOption
              key={item.value}
              label={item.label}
              disabled={disabled.has(item.value)}
              onClick={() => {
                const next = switchActionType(item.value, assignableAgents, statusItems, labels);
                if (next) {
                  onAdd(next);
                  setOpen(false);
                }
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionOption({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function switchActionType(
  type: string,
  agents: Agent[],
  statuses: BoardStatus[],
  labels: IssueLabelRecord[],
): RuleAction | null {
  if (type === 'assign_agent') {
    const agent = agents[0];
    return agent ? { type, agentId: agent.id } : null;
  }
  if (type === 'set_status') {
    const status = statuses[0];
    return status ? { type, statusKey: status.key } : null;
  }
  if (type === 'add_label' || type === 'remove_label') {
    const label = labels[0];
    return label ? { type, labelId: label.id } : null;
  }
  if (type === 'notify_owner') {
    return { type, text: 'Rule fired' };
  }
  if (type === 'unassign') {
    return { type };
  }
  if (type === 'stop') {
    return { type };
  }
  return null;
}
