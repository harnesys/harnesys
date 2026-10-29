import type { BoardStatus, IssueType } from '@harnesys/studio-shared';
import { ISSUE_TYPES } from '@harnesys/studio-shared';
import { ChevronDownIcon, FilterIcon } from 'lucide-react';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import { useIssueLabelStore } from '@/entities/issue';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Switch } from '@/shared/ui/switch';
import { sortedStatuses } from '../model/board-columns';
import { activeFilterCount } from '../model/issue-filters';
import { ISSUE_PRIORITY_OPTIONS, issueTypeIcon, priorityMeta } from '../model/issue-meta';
import type { IssueFilters } from '../model/issue-view.store';

function toggleIn<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function FilterRow({
  icon,
  label,
  checked,
  onToggle,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <label
      htmlFor={testId}
      className="flex cursor-default select-none items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden focus-within:bg-accent focus-within:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-3">
        {icon}
      </span>
      <span className="flex-1 text-xs">{label}</span>
      <Switch
        id={testId}
        size="sm"
        checked={checked}
        data-testid={testId}
        onCheckedChange={(value) => onToggle(value)}
      />
    </label>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <h5 className="px-1.5 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </h5>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function BoardFilterPopover({
  filters,
  statuses,
  agents,
  onPatch,
}: {
  filters: IssueFilters;
  statuses: BoardStatus[];
  agents: Agent[];
  onPatch: (patch: Partial<IssueFilters>) => void;
}) {
  const labels = useIssueLabelStore((state) => state.items);
  const assignableAgents = agents.filter((agent) => !agent.parentId);
  const count = activeFilterCount(filters);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <FilterIcon />
            Filter
            {count > 0 ? (
              <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
                {count}
              </span>
            ) : (
              <ChevronDownIcon />
            )}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={4} className="w-56 gap-2 p-1">
        <FilterGroup title="Status">
          {sortedStatuses(statuses).map((status: BoardStatus) => (
            <FilterRow
              key={status.key}
              icon={
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color ?? '#94a3b8' }}
                />
              }
              label={status.label}
              checked={filters.statuses.includes(status.key)}
              onToggle={() => onPatch({ statuses: toggleIn<string>(filters.statuses, status.key) })}
              testId={`issue-filter-status-${status.key}`}
            />
          ))}
        </FilterGroup>
        <FilterGroup title="Priority">
          {ISSUE_PRIORITY_OPTIONS.map((value: number) => {
            const meta = priorityMeta(value);
            return (
              <FilterRow
                key={value}
                icon={meta.icon}
                label={meta.label}
                checked={filters.priorities.includes(value)}
                onToggle={() => onPatch({ priorities: toggleIn(filters.priorities, value) })}
                testId={`issue-filter-priority-${value}`}
              />
            );
          })}
        </FilterGroup>
        <FilterGroup title="Type">
          {ISSUE_TYPES.map((type: IssueType) => (
            <FilterRow
              key={type}
              icon={issueTypeIcon(type)}
              label={type}
              checked={filters.types.includes(type)}
              onToggle={() => onPatch({ types: toggleIn<IssueType>(filters.types, type) })}
              testId={`issue-filter-type-${type}`}
            />
          ))}
        </FilterGroup>
        {labels.length > 0 ? (
          <FilterGroup title="Labels">
            {labels.map((label) => (
              <FilterRow
                key={label.id}
                icon={
                  <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                }
                label={label.title}
                checked={filters.labels.includes(label.id)}
                onToggle={() => onPatch({ labels: toggleIn(filters.labels, label.id) })}
                testId={`issue-filter-label-${label.id}`}
              />
            ))}
          </FilterGroup>
        ) : null}
        {assignableAgents.length > 0 ? (
          <FilterGroup title="Assignee">
            {assignableAgents.map((agent) => (
              <FilterRow
                key={agent.id}
                icon={<AgentRecordAvatar agent={agent} />}
                label={agent.name}
                checked={filters.assignees.includes(agent.id)}
                onToggle={() => onPatch({ assignees: toggleIn(filters.assignees, agent.id) })}
                testId={`issue-filter-assignee-${agent.id}`}
              />
            ))}
          </FilterGroup>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
