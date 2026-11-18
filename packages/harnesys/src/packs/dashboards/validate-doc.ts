import type { WidgetDoc } from '@harnesys/contracts';
import { parseOrgApiPath, primitiveById, WidgetDocSchema } from '@harnesys/contracts';
import type { z } from 'zod';

export interface WidgetDocIssue {
  path: string;
  message: string;
}

export interface WidgetDocValidation {
  ok: boolean;
  issues: WidgetDocIssue[];
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

function zodIssues(error: z.ZodError, prefix: string): WidgetDocIssue[] {
  return error.issues.map((issue) => ({
    path: joinPath(prefix, issue.path),
    message: issue.message,
  }));
}

function checkSourceOrg(orgId: string, doc: WidgetDoc, issues: WidgetDocIssue[]): void {
  doc.sources.forEach((source, index) => {
    if (source.kind !== 'orgApi') {
      return;
    }
    const checked = parseOrgApiPath(source.path, orgId);
    if (!checked.ok) {
      issues.push({
        path: `sources[${index}].path`,
        message: `orgApi path must target the widget org: ${checked.reason}`,
      });
    }
  });
}

function checkItems(doc: WidgetDoc, issues: WidgetDocIssue[]): void {
  const seen = new Set<string>();
  doc.items.forEach((item, index) => {
    const base = `items[${index}]`;
    if (seen.has(item.id)) {
      issues.push({ path: `${base}.id`, message: `duplicate widget item id "${item.id}"` });
    }
    seen.add(item.id);
    const descriptor = primitiveById(item.primitive);
    if (descriptor === undefined) {
      issues.push({ path: `${base}.primitive`, message: `unknown primitive "${item.primitive}"` });
      return;
    }
    const props = descriptor.props.safeParse(item.props);
    if (!props.success) {
      issues.push(...zodIssues(props.error, `${base}.props`));
    }
    for (const event of Object.keys(item.on)) {
      if (!Object.hasOwn(descriptor.events, event)) {
        issues.push({
          path: `${base}.on.${event}`,
          message: `unknown event for ${item.primitive}`,
        });
      }
    }
  });
}

/**
 * Dry run of the contract layer the pack can reach. The server guard owns the
 * rest (reference roots, derived cycles, source param placement, `callApi`
 * orgs) and runs it when a widget is created or updated.
 */
export function validateWidgetDoc(orgId: string, doc: unknown): WidgetDocValidation {
  const parsed = WidgetDocSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, issues: zodIssues(parsed.error, '') };
  }
  const issues: WidgetDocIssue[] = [];
  checkSourceOrg(orgId, parsed.data, issues);
  checkItems(parsed.data, issues);
  return { ok: issues.length === 0, issues };
}
