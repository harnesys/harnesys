import type { WidgetDoc } from './doc.ts';
import { WidgetDocSchema } from './doc.ts';
import { EXPR_FN_SIGNATURES } from './expr.ts';
import { hasParamRef, hasParamRefDeep } from './param-ref.ts';
import { parseOrgApiPath } from './path-guard.ts';
import type { ExternalSource, OrgApiSource, WidgetSource } from './sources.ts';
import { derivedCycles, fnNamesOf, pushRefIssues } from './widget-doc-expr.ts';
import type { ScopedIssue } from './widget-doc-issue.ts';
import { zodIssues } from './widget-doc-issue.ts';
import type { ItemCheckContext } from './widget-doc-item.ts';
import { checkItem } from './widget-doc-item.ts';

const MAX_DOC_BYTES = 256 * 1024;
const PARAMS_QUERY_BODY_ONLY = 'params are only substitutable in query and body';
const PARAMS_EXTERNAL_ONLY = 'params are external-only: orgApi sources cannot use {{param:name}}';

/**
 * A document either survives every check or carries the findings that stopped
 * it. One implementation serves the server guard and the agent dry-run tool, so
 * `dashboard_widgets_validate` cannot report a doc the create path rejects.
 */
export type WidgetDocCheck =
  | { ok: true; doc: WidgetDoc; issues: readonly [] }
  | { ok: false; doc: null; issues: ScopedIssue[] };

/**
 * Contract schema plus the cross-item invariants a JSON schema cannot express:
 * primitive props, event names, binding roots, `derived` references and cycles,
 * and the org of every `callApi` path. Structure (traversal, encoding, control
 * characters) is the shared path guard's job; this layer adds the org.
 *
 * Findings are `{ path, message }` dot paths inside the doc, so an agent can fix
 * the exact fields.
 */
export function checkWidgetDoc(orgId: string, doc: unknown): WidgetDocCheck {
  const byteLength = new TextEncoder().encode(JSON.stringify(doc) ?? '').length;
  if (byteLength > MAX_DOC_BYTES) {
    return {
      ok: false,
      doc: null,
      issues: [
        {
          path: '',
          message: `widget doc exceeds the ${MAX_DOC_BYTES}-byte cap (${byteLength} bytes)`,
        },
      ],
    };
  }
  const parsed = WidgetDocSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, doc: null, issues: zodIssues(parsed.error, '') };
  }
  const data = parsed.data;
  const sourceIds = new Set(data.sources.map((source) => source.id));
  const issues: ScopedIssue[] = [];
  checkSources(orgId, data, sourceIds, issues);
  checkDerived(data, sourceIds, issues);
  const ctx: ItemCheckContext = {
    orgId,
    doc: data,
    sourceIds,
    issues,
    seenItemIds: new Set<string>(),
  };
  data.items.forEach((item, index) => {
    checkItem(item, index, ctx);
  });
  return issues.length === 0
    ? { ok: true, doc: data, issues: [] }
    : { ok: false, doc: null, issues };
}

function checkSources(
  orgId: string,
  doc: WidgetDoc,
  sourceIds: Set<string>,
  issues: ScopedIssue[],
): void {
  doc.sources.forEach((source, index) => {
    const sourceId = source.id;
    checkSourceParams(source, index, issues);
    if (source.kind === 'orgApi') {
      const checked = parseOrgApiPath(source.path, orgId);
      if (!checked.ok) {
        issues.push({
          path: `sources[${index}].path`,
          message: `orgApi path must target the widget org: ${checked.reason}`,
          sourceId,
        });
      }
    }
    for (const [key, expr] of Object.entries(source.query ?? {})) {
      pushRefIssues(expr, doc, sourceIds, 'reference', {
        path: `sources[${index}].query.${key}`,
        issues,
        sourceId,
      });
    }
    if (source.body !== undefined) {
      pushRefIssues(source.body, doc, sourceIds, 'reference', {
        path: `sources[${index}].body`,
        issues,
        sourceId,
      });
    }
  });
}

function checkSourceParams(source: WidgetSource, index: number, issues: ScopedIssue[]): void {
  if (source.kind === 'orgApi') {
    checkOrgApiParams(source, index, issues);
    return;
  }
  checkExternalParams(source, index, issues);
}

function checkOrgApiParams(source: OrgApiSource, index: number, issues: ScopedIssue[]): void {
  const sourceId = source.id;
  if (hasParamRef(source.path)) {
    issues.push({ path: `sources[${index}].path`, message: PARAMS_EXTERNAL_ONLY, sourceId });
  }
  for (const [key, expr] of Object.entries(source.query ?? {})) {
    if (hasParamRefDeep(expr)) {
      issues.push({
        path: `sources[${index}].query.${key}`,
        message: PARAMS_EXTERNAL_ONLY,
        sourceId,
      });
    }
  }
  if (source.body !== undefined && hasParamRefDeep(source.body)) {
    issues.push({ path: `sources[${index}].body`, message: PARAMS_EXTERNAL_ONLY, sourceId });
  }
  pushTopicParamIssues(source, index, issues, PARAMS_EXTERNAL_ONLY);
}

function checkExternalParams(source: ExternalSource, index: number, issues: ScopedIssue[]): void {
  const sourceId = source.id;
  if (hasParamRef(source.url)) {
    issues.push({ path: `sources[${index}].url`, message: PARAMS_QUERY_BODY_ONLY, sourceId });
  }
  for (const [key, value] of Object.entries(source.headers ?? {})) {
    if (hasParamRef(key) || hasParamRef(value)) {
      issues.push({
        path: `sources[${index}].headers.${key}`,
        message: PARAMS_QUERY_BODY_ONLY,
        sourceId,
      });
    }
  }
  pushTopicParamIssues(source, index, issues, PARAMS_QUERY_BODY_ONLY);
}

function pushTopicParamIssues(
  source: WidgetSource,
  index: number,
  issues: ScopedIssue[],
  message: string,
): void {
  const topics = source.refresh?.topics ?? [];
  if (topics.some(hasParamRef)) {
    issues.push({ path: `sources[${index}].refresh.topics`, message, sourceId: source.id });
  }
}

function checkDerived(doc: WidgetDoc, sourceIds: Set<string>, issues: ScopedIssue[]): void {
  for (const [name, expr] of Object.entries(doc.derived)) {
    const path = `derived.${name}`;
    pushRefIssues(expr, doc, sourceIds, 'reference', { path, issues });
    for (const fnName of fnNamesOf(expr)) {
      if (!Object.hasOwn(EXPR_FN_SIGNATURES, fnName)) {
        issues.push({ path, message: `unknown expr fn "${fnName}"` });
      }
    }
  }
  for (const cycle of derivedCycles(doc.derived)) {
    issues.push({ path: `derived.${cycle[0]}`, message: `derived cycle: ${cycle.join(' -> ')}` });
  }
}
