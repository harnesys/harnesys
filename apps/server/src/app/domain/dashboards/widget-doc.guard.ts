import type { ExternalSource, OrgApiSource, WidgetDoc, WidgetSource } from '@harnesys/contracts';
import { EXPR_FN_SIGNATURES, parseOrgApiPath, WidgetDocSchema } from '@harnesys/contracts';
import { hasParamRef, hasParamRefDeep } from './param-ref.ts';
import { derivedCycles, fnNamesOf, pushRefIssues } from './widget-doc-expr.ts';
import { failure, type ScopedIssue, zodIssues } from './widget-doc-issue.ts';
import { checkItem, type ItemCheckContext } from './widget-doc-item.ts';

export type { WidgetDocIssue } from './widget-doc-issue.ts';

const PARAMS_QUERY_BODY_ONLY = 'params are only substitutable in query and body';
const PARAMS_EXTERNAL_ONLY = 'params are external-only: orgApi sources cannot use {{param:name}}';

/**
 * Single choke point for widget doc validation: contract schema plus the
 * cross-item invariants a JSON schema cannot express — primitive props, event
 * names, binding roots, `derived` references and cycles, and the org of every
 * `callApi` path. Structure (traversal, encoding, control characters) is the
 * shared contract path guard's job; this layer adds the org.
 *
 * Failures throw one `DashboardWidgetValidationException` whose `details.issues`
 * is an `Array<{ path, message }>` so an agent can fix the exact fields.
 */
export function validateWidgetDoc(orgId: string, doc: unknown): WidgetDoc {
  const sizeCap = 256 * 1024;
  const byteLength = new TextEncoder().encode(JSON.stringify(doc) ?? '').length;
  if (byteLength > sizeCap) {
    throw failure('widget doc too large', [
      { path: '', message: `widget doc exceeds the ${sizeCap}-byte cap (${byteLength} bytes)` },
    ]);
  }
  const parsed = WidgetDocSchema.safeParse(doc);
  if (!parsed.success) {
    throw failure('schema mismatch', zodIssues(parsed.error, ''));
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
  if (issues.length > 0) {
    throw failure('widget doc invariants', issues);
  }
  return data;
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
