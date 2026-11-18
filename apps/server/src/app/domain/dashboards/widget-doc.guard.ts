import type { WidgetDoc } from '@harnesys/contracts';
import { checkWidgetDoc, type ScopedIssue } from '@harnesys/contracts';
import { DashboardWidgetValidationException } from './dashboard.error.ts';

/**
 * Server entry to the shared widget doc check: the same `checkWidgetDoc` the
 * agent dry-run tool runs, translated into the one exception the REST contract
 * and the tool layer expose as `details.issues: [{ path, message }]`.
 */
export function validateWidgetDoc(orgId: string, doc: unknown): WidgetDoc {
  const result = checkWidgetDoc(orgId, doc);
  if (!result.ok) {
    throw failure(result.issues);
  }
  return result.doc;
}

function failure(issues: ScopedIssue[]): DashboardWidgetValidationException {
  const itemIds = [...new Set(issues.map((issue) => issue.itemId).filter(isString))];
  const sourceIds = [...new Set(issues.map((issue) => issue.sourceId).filter(isString))];
  return new DashboardWidgetValidationException('widget doc invariants', {
    issues: issues.map(({ path, message }) => ({ path, message })),
    ...(itemIds.length === 1 ? { itemId: itemIds[0] } : {}),
    ...(sourceIds.length === 1 ? { sourceId: sourceIds[0] } : {}),
  });
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
