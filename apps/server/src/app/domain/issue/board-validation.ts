import type { BoardStatus } from '@harnesys/contracts';

export type BoardValidationCode =
  | 'too-few'
  | 'entry-count'
  | 'dup-key'
  | 'empty-label'
  | 'missing-key'
  | 'unknown-key'
  | 'immutable-key';

export interface BoardValidationIssue {
  field: 'statuses' | 'rules';
  code: BoardValidationCode;
  key?: string;
}

export function validateStatuses(statuses: BoardStatus[]): BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = [];
  if (statuses.length < 2) {
    issues.push({ field: 'statuses', code: 'too-few' });
  }
  const entryCount = statuses.filter((status) => status.isEntry).length;
  if (entryCount !== 1) {
    issues.push({ field: 'statuses', code: 'entry-count' });
  }
  const seen = new Set<string>();
  for (const status of statuses) {
    if (status.label.trim().length === 0) {
      issues.push({ field: 'statuses', code: 'empty-label', key: status.key });
    }
    if (seen.has(status.key)) {
      issues.push({ field: 'statuses', code: 'dup-key', key: status.key });
    }
    seen.add(status.key);
  }
  return issues;
}
