import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ChevronDownIcon,
  CircleDotIcon,
  FlagIcon,
  RefreshCwIcon,
  TagIcon,
  TypeIcon,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { IssueSort, IssueSortField, IssueSortOrder } from '../model/issue-view.store';

const SORT_OPTIONS: { field: IssueSortField; label: string; icon: React.ReactNode }[] = [
  { field: 'priority', label: 'Priority', icon: <FlagIcon className="size-3" /> },
  { field: 'createdAt', label: 'Created', icon: <CalendarPlusIcon className="size-3" /> },
  { field: 'updatedAt', label: 'Updated', icon: <RefreshCwIcon className="size-3" /> },
  { field: 'dueDate', label: 'Due date', icon: <CalendarIcon className="size-3" /> },
  { field: 'title', label: 'Title', icon: <TypeIcon className="size-3" /> },
  { field: 'type', label: 'Type', icon: <TagIcon className="size-3" /> },
  { field: 'status', label: 'Status', icon: <CircleDotIcon className="size-3" /> },
];

export function BoardSortPopover({
  sort,
  onToggle,
}: {
  sort: IssueSort;
  onToggle: (field: IssueSortField) => void;
}) {
  const active = SORT_OPTIONS.find((option) => option.field === sort.field);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" data-testid="issue-sort-open">
            <ArrowUpDownIcon />
            <span className="text-xs">{active?.label}</span>
            <ChevronDownIcon className="opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuGroup>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.field}
              className="gap-2 text-xs"
              data-testid={`issue-sort-${option.field}`}
              onClick={() => onToggle(option.field)}
            >
              <span className="shrink-0 text-muted-foreground">{option.icon}</span>
              {option.label}
              {sort.field === option.field ? <SortOrderMark order={sort.order} /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortOrderMark({ order }: { order: IssueSortOrder }) {
  if (order === 'asc') {
    return <ArrowUpIcon className="ml-auto size-3 shrink-0 text-primary" />;
  }
  return <ArrowDownIcon className="ml-auto size-3 shrink-0 text-primary" />;
}
