import type { IssueType, RuleCondition, RuleConditionType } from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { ChevronLeftIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  ISSUE_PRIORITY_META,
  ISSUE_PRIORITY_OPTIONS,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPE_OPTIONS,
  issueTypeIcon,
} from '../model/issue-meta';
import {
  LabelPicker,
  LabelPickerPopover,
  RuleLabelTriggerLabel,
} from './label-editor/label-picker';

const CONDITION_TYPE_ITEMS = [
  { value: 'has_label', label: 'Label is' },
  { value: 'has_not_label', label: "Label isn't" },
  { value: 'has_priority', label: 'Priority is' },
  { value: 'has_type', label: 'Type is' },
  { value: 'has_open_blockers', label: 'Open blockers' },
];

const LABEL_CONDITION_TYPES: RuleConditionType[] = ['has_label', 'has_not_label'];

function isLabelCondition(
  condition: RuleCondition,
): condition is Extract<RuleCondition, { labelId: string }> {
  return condition.type === 'has_label' || condition.type === 'has_not_label';
}

const FIELD_CLASS =
  'h-7 min-w-0 flex-1 rounded-[min(var(--radius-md),10px)] text-xs data-[size=sm]:rounded-[min(var(--radius-md),10px)]';

export function ConditionRow({
  orgId,
  condition,
  labels,
  onChange,
  onRemove,
}: {
  orgId: string;
  condition: RuleCondition;
  labels: IssueLabelRecord[];
  onChange: (condition: RuleCondition) => void;
  onRemove: () => void;
}) {
  const label = isLabelCondition(condition)
    ? labels.find((item) => item.id === condition.labelId)
    : undefined;

  return (
    <div className="flex items-center gap-2" data-testid={`rule-condition-${condition.type}`}>
      <Select
        items={CONDITION_TYPE_ITEMS}
        value={condition.type}
        onValueChange={(value) => {
          const next = switchConditionType(String(value), condition, labels);
          if (next) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-32 shrink-0 rounded-[min(var(--radius-md),10px)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_TYPE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLabelCondition(condition) ? (
        <LabelPickerPopover
          orgId={orgId}
          selected={[condition.labelId]}
          onChange={(selected) => {
            const labelId = selected[0];
            if (labelId) {
              onChange({ type: condition.type, labelId });
            }
          }}
          single
          manage
          align="start"
          trigger={{
            className:
              'flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent px-2 text-left text-xs text-foreground transition-colors hover:bg-muted/40',
            testId: `rule-condition-label-${condition.labelId}`,
            children: <RuleLabelTriggerLabel label={label} />,
          }}
        />
      ) : null}
      {condition.type === 'has_priority' ? (
        <Select
          items={ISSUE_PRIORITY_OPTIONS.map((value) => ({
            value: String(value),
            label: ISSUE_PRIORITY_META[value].label,
          }))}
          value={String(condition.priority)}
          onValueChange={(value) =>
            value && onChange({ type: 'has_priority', priority: Number(value) })
          }
        >
          <SelectTrigger size="sm" className={FIELD_CLASS}>
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_PRIORITY_OPTIONS.map((value) => (
              <SelectItem key={value} value={String(value)}>
                <span className="flex items-center gap-1.5">
                  {ISSUE_PRIORITY_META[value].icon}
                  {ISSUE_PRIORITY_META[value].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {condition.type === 'has_type' ? (
        <Select
          items={ISSUE_TYPE_OPTIONS.map((value) => ({
            value,
            label: ISSUE_TYPE_LABELS[value],
          }))}
          value={condition.issueType}
          onValueChange={(value) =>
            value && onChange({ type: 'has_type', issueType: String(value) as IssueType })
          }
        >
          <SelectTrigger size="sm" className={FIELD_CLASS}>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_TYPE_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-1.5">
                  {issueTypeIcon(value)}
                  {ISSUE_TYPE_LABELS[value]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {condition.type === 'has_open_blockers' ? (
        <Select
          items={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          value={condition.value ? 'yes' : 'no'}
          onValueChange={(value) =>
            value && onChange({ type: 'has_open_blockers', value: value === 'yes' })
          }
        >
          <SelectTrigger size="sm" className={FIELD_CLASS}>
            <SelectValue placeholder="Blockers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove condition"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function ConditionAdd({
  orgId,
  ruleId,
  onAdd,
}: {
  orgId: string;
  ruleId: string;
  onAdd: (condition: RuleCondition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [labelMode, setLabelMode] = useState<'has_label' | 'has_not_label' | null>(null);

  const close = (): void => {
    setOpen(false);
    setLabelMode(null);
  };

  const add = (condition: RuleCondition): void => {
    onAdd(condition);
    close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setLabelMode(null);
        }
      }}
    >
      <PopoverTrigger
        data-testid={`board-rule-condition-add-${ruleId}`}
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border border-border border-dashed bg-transparent px-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted"
      >
        <PlusIcon className="size-3.5" />
        Add condition
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-56 p-1.5">
        {labelMode ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setLabelMode(null)}
              className="flex items-center gap-1 rounded-md px-1 py-1 text-left text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeftIcon className="size-3.5" />
              {labelMode === 'has_label' ? 'Label is' : "Label isn't"}
            </button>
            <LabelPicker
              orgId={orgId}
              selected={[]}
              single
              manage
              onChange={(selected) => {
                const labelId = selected[0];
                if (labelId) {
                  add({ type: labelMode, labelId });
                }
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <PopoverTitle className="px-1.5 pt-0.5 pb-1 text-muted-foreground text-xs">
              Add condition
            </PopoverTitle>
            {CONDITION_TYPE_ITEMS.map((item) => (
              <ConditionOption
                key={item.value}
                label={item.label}
                onClick={() => {
                  if (item.value === 'has_label' || item.value === 'has_not_label') {
                    setLabelMode(item.value);
                    return;
                  }
                  add(defaultCondition(String(item.value)));
                }}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ConditionOption({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {label}
    </button>
  );
}

function defaultCondition(type: string): RuleCondition {
  if (type === 'has_priority') {
    return { type: 'has_priority', priority: 3 };
  }
  if (type === 'has_type') {
    return { type: 'has_type', issueType: 'task' };
  }
  return { type: 'has_open_blockers', value: true };
}

function switchConditionType(
  type: string,
  prev: RuleCondition,
  labels: IssueLabelRecord[],
): RuleCondition | null {
  if (LABEL_CONDITION_TYPES.includes(type as RuleConditionType)) {
    const labelId = isLabelCondition(prev) ? prev.labelId : labels[0]?.id;
    return labelId ? { type: type as 'has_label' | 'has_not_label', labelId } : null;
  }
  if (type === 'has_priority') {
    return { type, priority: prev.type === 'has_priority' ? prev.priority : 3 };
  }
  if (type === 'has_type') {
    return { type, issueType: prev.type === 'has_type' ? prev.issueType : 'task' };
  }
  if (type === 'has_open_blockers') {
    return { type, value: prev.type === 'has_open_blockers' ? prev.value : true };
  }
  return null;
}
