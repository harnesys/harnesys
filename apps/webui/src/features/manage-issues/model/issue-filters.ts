import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { statusOf } from './board-columns';
import type { IssueFilters, IssueSort } from './issue-view.store';

function fieldTime(value: string | null): number {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

function compareBy(
  sort: IssueSort,
  statuses: BoardStatus[],
): (a: IssueRecord, b: IssueRecord) => number {
  const direction = sort.order === 'asc' ? 1 : -1;
  switch (sort.field) {
    case 'priority':
      return (a, b) => (a.priority - b.priority) * direction;
    case 'createdAt':
      return (a, b) => (fieldTime(a.createdAt) - fieldTime(b.createdAt)) * direction;
    case 'updatedAt':
      return (a, b) => (fieldTime(a.updatedAt) - fieldTime(b.updatedAt)) * direction;
    case 'dueDate':
      return (a, b) => {
        const left = a.dueDate ? fieldTime(a.dueDate) : Number.MAX_SAFE_INTEGER;
        const right = b.dueDate ? fieldTime(b.dueDate) : Number.MAX_SAFE_INTEGER;
        return (left - right) * direction;
      };
    case 'title':
      return (a, b) => compareStrings(a.title, b.title) * direction;
    case 'type':
      return (a, b) => compareStrings(a.type, b.type) * direction;
    case 'status':
      return (a, b) =>
        compareStrings(
          statusOf(statuses, a.statusKey)?.label ?? a.statusKey,
          statusOf(statuses, b.statusKey)?.label ?? b.statusKey,
        ) * direction;
  }
}

export function sortIssues(
  issues: IssueRecord[],
  sort: IssueSort,
  statuses: BoardStatus[] = [],
): IssueRecord[] {
  return [...issues].sort(compareBy(sort, statuses));
}

export function applyIssueFilters(issues: IssueRecord[], filters: IssueFilters): IssueRecord[] {
  return issues.filter((issue) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(issue.statusKey)) {
      return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(issue.priority)) {
      return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(issue.type)) {
      return false;
    }
    if (filters.labels.length > 0 && !filters.labels.some((id) => issue.labels.includes(id))) {
      return false;
    }
    if (filters.assignees.length > 0) {
      const assignee = issue.assigneeAgentId;
      if (!assignee || !filters.assignees.includes(assignee)) {
        return false;
      }
    }
    return true;
  });
}

export function activeFilterCount(filters: IssueFilters): number {
  return (
    filters.statuses.length +
    filters.priorities.length +
    filters.types.length +
    filters.labels.length +
    filters.assignees.length
  );
}
