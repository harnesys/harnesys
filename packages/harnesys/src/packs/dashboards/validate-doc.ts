import type { WidgetDocIssue } from '@harnesys/contracts';
import { checkWidgetDoc } from '@harnesys/contracts';

export interface WidgetDocValidation {
  ok: boolean;
  issues: WidgetDocIssue[];
}

/**
 * Dry run of the exact check `create` and `update` run, without writing. The
 * shared `checkWidgetDoc` owns the rules (contract schema, props, events,
 * bindings, derived cycles, org-scoped paths), so this tool cannot report a doc
 * the guard rejects.
 */
export function validateWidgetDoc(orgId: string, doc: unknown): WidgetDocValidation {
  const result = checkWidgetDoc(orgId, doc);
  return {
    ok: result.ok,
    issues: result.issues.map(({ path, message }) => ({ path, message })),
  };
}
