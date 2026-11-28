import type { IssueDependencyType, IssueType } from '@harnesys/studio-shared';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BugIcon,
  CheckSquareIcon,
  CompassIcon,
  CopyIcon,
  FileTextIcon,
  FlameIcon,
  Link2Icon,
  LockIcon,
  MinusIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { isDateOnlyValue } from '@/shared/lib/time-zone';
import { cn } from '@/shared/lib/utils';

interface PriorityMeta {
  label: string;
  dot: string;
  text: string;
  icon: React.ReactNode;
}

function priorityEntry(label: string, dot: string, text: string, Icon: LucideIcon): PriorityMeta {
  return { label, dot, text, icon: <Icon className={cn('size-3.5', text)} /> };
}

export const ISSUE_PRIORITY_META: Record<number, PriorityMeta> = {
  1: priorityEntry('Critical', 'bg-destructive', 'text-destructive', FlameIcon),
  2: priorityEntry('High', 'bg-destructive/70', 'text-destructive/70', ArrowUpIcon),
  3: priorityEntry('Medium', 'bg-status-warn', 'text-status-warn', MinusIcon),
  4: priorityEntry('Low', 'bg-status-ok', 'text-status-ok', ArrowDownIcon),
};

import type { IssuePriority } from '@harnesys/studio-shared';

export const ISSUE_PRIORITY_OPTIONS: readonly IssuePriority[] = [1, 2, 3, 4];

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  task: 'Task',
  bug: 'Bug',
  research: 'Research',
  feature: 'Feature',
  improvement: 'Improvement',
  review: 'Review',
};

export const ISSUE_TYPE_OPTIONS: readonly IssueType[] = [
  'task',
  'bug',
  'research',
  'feature',
  'improvement',
  'review',
];

const TYPE_ICONS: Record<IssueType, React.ReactNode> = {
  task: <CheckSquareIcon className="size-3.5" />,
  bug: <BugIcon className="size-3.5 text-red-500" />,
  research: <CompassIcon className="size-3.5" />,
  feature: <SparklesIcon className="size-3.5 text-primary" />,
  improvement: <TrendingUpIcon className="size-3.5" />,
  review: <FileTextIcon className="size-3.5" />,
};

const TYPE_HEADER_ICONS: Record<IssueType, React.ReactNode> = {
  task: <CheckSquareIcon className="size-5 text-blue-400" />,
  bug: <BugIcon className="size-5 text-red-500" />,
  research: <CompassIcon className="size-5 text-purple-400" />,
  feature: <SparklesIcon className="size-5 text-amber-400" />,
  improvement: <TrendingUpIcon className="size-5 text-green-400" />,
  review: <FileTextIcon className="size-5 text-slate-400" />,
};

export function issueTypeIcon(type: IssueType): React.ReactNode {
  return TYPE_ICONS[type];
}

export function issueTypeHeaderIcon(type: IssueType): React.ReactNode {
  return TYPE_HEADER_ICONS[type];
}

export function priorityMeta(priority: number): PriorityMeta {
  return ISSUE_PRIORITY_META[priority] ?? ISSUE_PRIORITY_META[3];
}

const DEPENDENCY_ICONS: Record<IssueDependencyType, React.ReactNode> = {
  blocks: <LockIcon className="size-3.5 text-red-500" />,
  relates: <Link2Icon className="size-3.5 text-blue-500" />,
  duplicate: <CopyIcon className="size-3.5 text-slate-500" />,
};

export function dependencyTypeIcon(type: IssueDependencyType): React.ReactNode {
  return DEPENDENCY_ICONS[type];
}

export function toDateInputValue(value: string | null): string {
  if (!value) {
    return '';
  }
  if (isDateOnlyValue(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

export function fromDateInputValue(value: string): string | null {
  return isDateOnlyValue(value) ? value : null;
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}
