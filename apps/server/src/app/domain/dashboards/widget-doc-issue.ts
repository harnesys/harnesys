import type { z } from 'zod';
import { DashboardWidgetValidationException } from './dashboard.error.ts';

/** One validation finding, addressed by a dot path inside the widget doc. */
export interface WidgetDocIssue {
  path: string;
  message: string;
}

/** Issue plus the item/source it belongs to, used for the exception context. */
export interface ScopedIssue extends WidgetDocIssue {
  itemId?: string;
  sourceId?: string;
}

export function zodIssues(error: z.ZodError, prefix: string): WidgetDocIssue[] {
  return error.issues.map((issue) => ({
    path: joinPath(prefix, issue.path),
    message: issue.message,
  }));
}

function joinPath(prefix: string, path: PropertyKey[]): string {
  let out = prefix;
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (out === '') {
      out = String(segment);
    } else {
      out += `.${String(segment)}`;
    }
  }
  return out === '' ? '(document)' : out;
}

export function failure(reason: string, issues: ScopedIssue[]): DashboardWidgetValidationException {
  const itemIds = [...new Set(issues.map((issue) => issue.itemId).filter(isString))];
  const sourceIds = [...new Set(issues.map((issue) => issue.sourceId).filter(isString))];
  return new DashboardWidgetValidationException(reason, {
    issues: issues.map(({ path, message }) => ({ path, message })),
    ...(itemIds.length === 1 ? { itemId: itemIds[0] } : {}),
    ...(sourceIds.length === 1 ? { sourceId: sourceIds[0] } : {}),
  });
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
