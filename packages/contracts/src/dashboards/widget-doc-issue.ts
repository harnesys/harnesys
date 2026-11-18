import type { z } from 'zod';

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
    path: joinPath(prefix, issuePath(issue)),
    message: issue.message,
  }));
}

/** `unrecognized_keys` carries the stray keys outside `path`; name the key. */
function issuePath(issue: z.core.$ZodIssue): PropertyKey[] {
  const path = issue.path.filter(isPropertyKey);
  if (issue.code !== 'unrecognized_keys') {
    return path;
  }
  const key = issue.keys[0];
  return key === undefined ? path : [...path, key];
}

function isPropertyKey(value: PropertyKey | undefined): value is PropertyKey {
  return value !== undefined;
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
