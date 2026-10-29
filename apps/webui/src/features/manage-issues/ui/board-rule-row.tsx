import type {
  BoardRule,
  BoardRuleInput,
  BoardStatus,
  ExecutionProfileListItem,
  RuleCondition,
} from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { type Agent } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { sortedStatuses } from '../model/board-columns';
import { ActionRow } from './board-rule-action-row';
import { LabelPickerPopover, RuleLabelTriggerLabel } from './label-editor/label-picker';

export function RuleRow({
  rule,
  orgId,
  statuses,
  agents,
  labels,
  profiles,
  defaultProfileId,
  onPatch,
  onRemove,
  onMove,
}: {
  rule: BoardRule;
  orgId: string;
  statuses: BoardStatus[];
  agents: Agent[];
  labels: IssueLabelRecord[];
  profiles: ExecutionProfileListItem[];
  defaultProfileId: string;
  onPatch: (patch: Partial<BoardRuleInput>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const statusItems = sortedStatuses(statuses);
  const triggerStatusKey = rule.trigger.type === 'status_entered' ? rule.trigger.statusKey : '';
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border px-2 py-2"
      data-testid={`board-rule-${rule.id}`}
    >
      <div className="flex items-center gap-1.5">
        <Switch
          checked={rule.enabled}
          size="sm"
          aria-label="Rule enabled"
          onCheckedChange={(enabled) => onPatch({ enabled })}
        />
        <Select
          items={[
            { value: 'status_entered', label: 'Status entered' },
            { value: 'issue_created', label: 'Issue created' },
          ]}
          value={rule.trigger.type}
          onValueChange={(value) => {
            if (value === 'issue_created') {
              onPatch({ trigger: { type: 'issue_created' } });
            } else if (statusItems[0]) {
              onPatch({
                trigger: { type: 'status_entered', statusKey: statusItems[0].key },
              });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-36 shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status_entered">Status entered</SelectItem>
            <SelectItem value="issue_created">Issue created</SelectItem>
          </SelectContent>
        </Select>
        {rule.trigger.type === 'status_entered' ? (
          <Select
            items={statusItems.map((item) => ({ value: item.key, label: item.label }))}
            value={triggerStatusKey}
            onValueChange={(value) =>
              value && onPatch({ trigger: { type: 'status_entered', statusKey: String(value) } })
            }
          >
            <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
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
        <div className="ml-auto flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move rule up"
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move rule down"
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove rule"
            onClick={onRemove}
          >
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1 pl-6">
        {rule.conditions.map((condition, index) => {
          if (condition.type !== 'has_label') {
            return null;
          }
          const label = labels.find((item) => item.id === condition.labelId);
          return (
            <div key={`${condition.type}-${index}`} className="flex items-center gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-muted-foreground uppercase">
                if label
              </span>
              <LabelPickerPopover
                orgId={orgId}
                selected={[condition.labelId]}
                onChange={(selected) => {
                  const labelId = selected[0];
                  if (!labelId) {
                    onPatch({ conditions: rule.conditions.filter((_, i) => i !== index) });
                    return;
                  }
                  const next: RuleCondition = { type: 'has_label', labelId };
                  onPatch({
                    conditions: rule.conditions.map((item, i) => (i === index ? next : item)),
                  });
                }}
                single
                manage
                align="start"
                trigger={{
                  className:
                    'h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent px-2 text-xs text-foreground transition-colors hover:bg-muted/40',
                  testId: `board-rule-condition-${rule.id}-${index}`,
                  children: <RuleLabelTriggerLabel label={label} />,
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove condition"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onPatch({ conditions: rule.conditions.filter((_, i) => i !== index) })
                }
              >
                <TrashIcon className="size-3" />
              </Button>
            </div>
          );
        })}
        <ConditionAddRow orgId={orgId} rule={rule} labels={labels} onPatch={onPatch} />
      </div>
      <div className="space-y-1 pl-6">
        {rule.actions.map((action, index) => (
          <ActionRow
            key={`${action.type}-${index}`}
            action={action}
            statuses={statuses}
            agents={agents}
            profiles={profiles}
            defaultProfileId={defaultProfileId}
            onPatch={(next) =>
              onPatch({ actions: rule.actions.map((item, i) => (i === index ? next : item)) })
            }
            onRemove={() => onPatch({ actions: rule.actions.filter((_, i) => i !== index) })}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 gap-1 text-[11px]"
          onClick={() => {
            const firstAgent = agents[0];
            onPatch({
              actions: [
                ...rule.actions,
                firstAgent
                  ? { type: 'assign_agent', agentId: firstAgent.id }
                  : { type: 'notify_owner', text: 'Rule fired' },
              ],
            });
          }}
          data-testid={`board-rule-action-add-${rule.id}`}
        >
          <PlusIcon className="size-3" />
          Add action
        </Button>
      </div>
    </div>
  );
}

function ConditionAddRow({
  orgId,
  rule,
  labels,
  onPatch,
}: {
  orgId: string;
  rule: BoardRule;
  labels: IssueLabelRecord[];
  onPatch: (patch: Partial<BoardRuleInput>) => void;
}) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <LabelPickerPopover
      orgId={orgId}
      selected={[]}
      single
      manage
      align="start"
      trigger={{
        className: cn(
          'h-6 w-fit gap-1 rounded-[min(var(--radius-md),10px)] px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40',
        ),
        testId: `board-rule-condition-add-${rule.id}`,
        children: <span className="flex items-center gap-1">+ label condition</span>,
      }}
      onChange={(selected) => {
        const labelId = selected[0];
        if (!labelId) {
          return;
        }
        onPatch({ conditions: [...rule.conditions, { type: 'has_label', labelId }] });
      }}
    />
  );
}
