import type { IssueDependencyType, IssueType } from '@harnesys/studio-shared';
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

interface PriorityMeta {
  label: string;
  dot: string;
  icon: React.ReactNode;
}

export const ISSUE_PRIORITY_META: Record<number, PriorityMeta> = {
  1: {
    label: 'Critical',
    dot: 'bg-destructive',
    icon: <FlameIcon className="size-3.5 text-destructive" />,
  },
  2: {
    label: 'High',
    dot: 'bg-destructive/70',
    icon: <ArrowUpIcon className="size-3.5 text-destructive" />,
  },
  3: {
    label: 'Medium',
    dot: 'bg-status-warn',
    icon: <MinusIcon className="size-3.5 text-status-warn" />,
  },
  4: {
    label: 'Low',
    dot: 'bg-status-ok',
    icon: <ArrowDownIcon className="size-3.5 text-status-ok" />,
  },
};

import type { IssuePriority } from '@harnesys/studio-shared';

export const ISSUE_PRIORITY_OPTIONS: readonly IssuePriority[] = [1, 2, 3, 4];

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
