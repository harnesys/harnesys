import type {
  BoardRule,
  BoardRuleInput,
  BoardStatus,
  ExecutionProfileListItem,
} from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, TrashIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { Agent } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { sortedStatuses } from '../model/board-columns';
import { ruleSummary } from '../model/rule-summary';
import { ActionAdd, ActionRow } from './board-rule-action-row';
import { ConditionAdd, ConditionRow } from './board-rule-condition-row';

const EVENT_ITEMS = [
  { value: 'status_entered', label: 'Entering a status' },
  { value: 'issue_created', label: 'Issue created' },
  { value: 'run_settled', label: 'A run settles' },
];

export function RuleRow({
  rule,
  index,
  orgId,
  statuses,
  agents,
  labels,
  profiles,
  defaultProfileId,
  onPatch,
  onRemove,
  onMove,
  showTrigger = true,
  highlight = false,
  initialOpen = false,
}: {
  rule: BoardRule;
  index: number;
  orgId: string;
  statuses: BoardStatus[];
  agents: Agent[];
  labels: IssueLabelRecord[];
  profiles: ExecutionProfileListItem[];
  defaultProfileId: string;
  onPatch: (patch: Partial<BoardRuleInput>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  showTrigger?: boolean;
  highlight?: boolean;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const statusItems = sortedStatuses(statuses);
  const triggerStatusKey = rule.trigger.type === 'status_entered' ? rule.trigger.statusKey : '';

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-lg border bg-card transition-colors',
        !rule.enabled && 'bg-muted/30',
        highlight && 'border-primary/50 ring-1 ring-primary/25',
      )}
      data-testid={`board-rule-${rule.id}`}
    >
      <div className="flex items-center gap-1 p-1">
        <CollapsibleTrigger className="group/head flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              !rule.enabled && 'text-muted-foreground',
            )}
          >
            {ruleSummary({ rule, agents, statuses, labels, showTrigger })}
          </span>
          {rule.enabled ? null : (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
              Off
            </span>
          )}
          <ChevronRightIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-0.5">
          <Switch
            size="sm"
            checked={rule.enabled}
            aria-label={rule.enabled ? 'Rule enabled' : 'Rule disabled'}
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
            className="mr-1"
            onCheckedChange={(enabled) => onPatch({ enabled })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move rule up"
            title="Move up"
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move rule down"
            title="Move down"
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove rule"
            title="Delete rule"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <CollapsibleContent className="border-t">
        <div className="space-y-3 px-3 py-3">
          {showTrigger ? (
            <Section label="When" hint="trigger">
              <div className="flex items-center gap-2">
                <Select
                  items={EVENT_ITEMS}
                  value={rule.trigger.type}
                  onValueChange={(value) => {
                    if (value === 'issue_created') {
                      onPatch({ trigger: { type: 'issue_created' } });
                    } else if (value === 'run_settled') {
                      onPatch({ trigger: { type: 'run_settled' } });
                    } else if (statusItems[0]) {
                      onPatch({
                        trigger: { type: 'status_entered', statusKey: statusItems[0].key },
                      });
                    }
                  }}
                >
                  <SelectTrigger size="sm" className="w-40 shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rule.trigger.type === 'status_entered' ? (
                  <Select
                    items={statusItems.map((item) => ({ value: item.key, label: item.label }))}
                    value={triggerStatusKey}
                    onValueChange={(value) =>
                      value &&
                      onPatch({ trigger: { type: 'status_entered', statusKey: String(value) } })
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
              </div>
            </Section>
          ) : null}
          <Section label="Only if" hint="all must match" divider={showTrigger}>
            {rule.conditions.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">
                No conditions — every issue here matches.
              </p>
            ) : (
              rule.conditions.map((condition, conditionIndex) => (
                <ConditionRow
                  key={`${condition.type}-${conditionIndex}`}
                  orgId={orgId}
                  condition={condition}
                  labels={labels}
                  onChange={(next) =>
                    onPatch({
                      conditions: rule.conditions.map((item, i) =>
                        i === conditionIndex ? next : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    onPatch({
                      conditions: rule.conditions.filter((_, i) => i !== conditionIndex),
                    })
                  }
                />
              ))
            )}
            <ConditionAdd
              orgId={orgId}
              ruleId={rule.id}
              onAdd={(condition) => onPatch({ conditions: [...rule.conditions, condition] })}
            />
          </Section>
          <Section label="Then" hint="in this order" divider>
            {rule.actions.map((action, actionIndex) => (
              <ActionRow
                key={`${action.type}-${actionIndex}`}
                action={action}
                orgId={orgId}
                statuses={statuses}
                agents={agents}
                profiles={profiles}
                defaultProfileId={defaultProfileId}
                labels={labels}
                triggerType={rule.trigger.type}
                onPatch={(next) =>
                  onPatch({
                    actions: rule.actions.map((item, i) => (i === actionIndex ? next : item)),
                  })
                }
                onRemove={() =>
                  onPatch({ actions: rule.actions.filter((_, i) => i !== actionIndex) })
                }
              />
            ))}
            <ActionAdd
              ruleId={rule.id}
              agents={agents}
              statuses={statuses}
              labels={labels}
              triggerType={rule.trigger.type}
              onAdd={(action) => onPatch({ actions: [...rule.actions, action] })}
            />
          </Section>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Section({
  label,
  hint,
  divider = false,
  children,
}: {
  label: string;
  hint?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', divider && 'border-border/60 border-t pt-3')}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-xs">{label}</p>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
