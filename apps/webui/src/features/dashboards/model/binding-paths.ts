import type { DashboardCatalogEntryDto, WidgetDoc } from '@harnesys/contracts';

interface JsonSchemaNode {
  type?: string;
  label?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

const MAX_DEPTH = 4;
const MAX_SUGGESTIONS = 120;

function asNode(value: unknown): JsonSchemaNode | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonSchemaNode;
}

function walkSchema(node: JsonSchemaNode, prefix: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH || out.length >= MAX_SUGGESTIONS) {
    return;
  }
  for (const [key, rawChild] of Object.entries(node.properties ?? {})) {
    const path = `${prefix}.${key}`;
    out.push(path);
    const child = asNode(rawChild);
    if (child) {
      walkSchema(child, path, depth + 1, out);
      const row = asNode(child.items);
      if (row) {
        walkSchema(row, `${path}[0]`, depth + 1, out);
      }
    }
  }
}

/** Bindable paths of one catalog response schema, walked from its JSON Schema. */
export function responsePaths(schema: Record<string, unknown> | null, sourceId: string): string[] {
  const root = asNode(schema);
  if (!root) {
    return [];
  }
  const out: string[] = [];
  walkSchema(root, `sources.${sourceId}`, 0, out);
  return out;
}

export function catalogEntryForPath(
  catalog: DashboardCatalogEntryDto[],
  path: string,
  orgId: string,
): DashboardCatalogEntryDto | undefined {
  return catalog.find((entry) => entry.path.replaceAll(':orgId', orgId) === path);
}

/**
 * Every root the expression picker offers: state keys, derived names, fields of
 * each declared source's catalog response, and the row/event/org roots.
 */
export function bindingPathOptions(
  doc: WidgetDoc,
  catalog: DashboardCatalogEntryDto[],
  orgId: string,
): string[] {
  const options: string[] = Object.keys(doc.state).map((key) => `state.${key}`);
  options.push(...Object.keys(doc.derived).map((name) => `derived.${name}`));
  for (const source of doc.sources) {
    if (source.kind !== 'orgApi') {
      continue;
    }
    const entry = catalogEntryForPath(catalog, source.path, orgId);
    if (entry) {
      options.push(...responsePaths(entry.responseSchema, source.id));
    } else {
      options.push(`sources.${source.id}`);
    }
  }
  options.push('row', 'event', 'org.id');
  return [...new Set(options)].slice(0, MAX_SUGGESTIONS);
}
