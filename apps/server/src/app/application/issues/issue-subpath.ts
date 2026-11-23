import { isAbsolute } from 'node:path';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';

export function validateWorkspaceSubpath(subpath: string): string {
  const trimmed = subpath.trim();
  if (trimmed === '') {
    throw new IssueValidationException('workspace subfolder must not be empty');
  }
  if (isAbsolute(trimmed)) {
    throw new IssueValidationException('workspace subfolder must be relative to the issue source');
  }
  if (trimmed.split(/[\\/]+/).includes('..')) {
    throw new IssueValidationException('workspace subfolder must not escape the issue source');
  }
  return trimmed;
}
