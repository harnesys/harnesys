import type { WidgetDoc } from './doc.ts';
import type { Expr, ExprFnName } from './expr.ts';
import { EXPR_FN_SIGNATURES, WHERE_OPS } from './expr.ts';
import { ROW_BINDINGS_PROP, rowBindingsOf } from './row-bindings.ts';
import type { ScopedIssue } from './widget-doc-issue.ts';

const TEMPLATE_TOKEN_PATTERN = /\{\{([^{}]*)\}\}/g;
const ARRAY_INDEX_PATTERN = /\[[^\]]*\]/g;

export interface IssueTarget {
  path: string;
  issues: ScopedIssue[];
  itemId?: string;
  sourceId?: string;
}

/** `stop`: marker node, do not descend. `walk`: plain container, descend. */
type WalkStep = 'stop' | 'walk';

/**
 * Visit every object node of an Expr tree. Marker nodes decide whether their
 * children are expressions (`fn.args`) or data (`ref`/`tpl`/`lit`).
 */
function walkExpr(expr: Expr, visit: (node: Record<string, unknown>) => WalkStep): void {
  if (Array.isArray(expr)) {
    for (const entry of expr) {
      walkExpr(entry, visit);
    }
    return;
  }
  if (!isRecord(expr)) {
    return;
  }
  if (visit(expr) === 'stop') {
    return;
  }
  for (const entry of Object.values(expr)) {
    walkExpr(entry as Expr, visit);
  }
}

export function pushRefIssues(
  expr: Expr,
  doc: WidgetDoc,
  sourceIds: Set<string>,
  noun: 'binding' | 'reference',
  target: IssueTarget,
): void {
  for (const ref of refsOf(expr)) {
    const problem = resolveRef(ref, doc, sourceIds, noun);
    if (problem !== null) {
      target.issues.push({
        path: target.path,
        message: problem,
        ...(target.itemId === undefined ? {} : { itemId: target.itemId }),
        ...(target.sourceId === undefined ? {} : { sourceId: target.sourceId }),
      });
    }
  }
  pushFnIssues(expr, target);
}

interface FnCall {
  name: string;
  argCount: number;
  args: readonly unknown[];
}

function fnCallsOf(expr: Expr): FnCall[] {
  const calls: FnCall[] = [];
  walkExpr(expr, (node) => {
    if (typeof node.fn === 'string') {
      calls.push({
        name: node.fn,
        argCount: Array.isArray(node.args) ? node.args.length : 0,
        args: Array.isArray(node.args) ? node.args : [],
      });
      return 'walk';
    }
    if (typeof node.ref === 'string' || typeof node.tpl === 'string' || 'lit' in node) {
      return 'stop';
    }
    return 'walk';
  });
  return calls;
}

function fnArityProblem(call: FnCall): string | null {
  if (!Object.hasOwn(EXPR_FN_SIGNATURES, call.name)) {
    return null;
  }
  const signature = EXPR_FN_SIGNATURES[call.name as ExprFnName];
  const max = signature.maxArgs === Number.POSITIVE_INFINITY ? null : signature.maxArgs;
  if (call.argCount >= signature.minArgs && (max === null || call.argCount <= max)) {
    return null;
  }
  const expected = max === null ? `at least ${signature.minArgs}` : `${signature.minArgs}..${max}`;
  return `fn "${call.name}" expects ${expected} arguments, received ${call.argCount}`;
}

function fnArgProblem(call: FnCall): string | null {
  if (call.name !== 'where') {
    return null;
  }
  const op = call.args[2];
  if (typeof op !== 'string') {
    return null;
  }
  if (!(WHERE_OPS as readonly string[]).includes(op)) {
    return `fn "where" expects a comparison op (${WHERE_OPS.join(', ')}), received "${op}"`;
  }
  const needsValue = op !== 'exists' && op !== 'missing';
  if (needsValue && call.argCount < 4) {
    return `fn "where" with op "${op}" expects a comparison value as the fourth argument`;
  }
  return null;
}

function pushFnIssues(expr: Expr, target: IssueTarget): void {
  for (const call of fnCallsOf(expr)) {
    const problem = fnArityProblem(call) ?? fnArgProblem(call);
    if (problem !== null) {
      target.issues.push({
        path: target.path,
        message: problem,
        ...(target.itemId === undefined ? {} : { itemId: target.itemId }),
        ...(target.sourceId === undefined ? {} : { sourceId: target.sourceId }),
      });
    }
  }
}

export function pushRowBindingIssues(
  props: Record<string, unknown>,
  doc: WidgetDoc,
  sourceIds: Set<string>,
  target: IssueTarget,
): void {
  const bindings = rowBindingsOf(props);
  if (bindings === null) {
    return;
  }
  for (const [key, expr] of Object.entries(bindings)) {
    const field: IssueTarget = {
      ...target,
      path: `${target.path}.${ROW_BINDINGS_PROP}.${key}`,
    };
    if (typeof expr === 'string') {
      const problem = resolveRef(expr, doc, sourceIds, 'binding');
      if (problem !== null) {
        target.issues.push({
          path: field.path,
          message: problem,
          ...(field.itemId === undefined ? {} : { itemId: field.itemId }),
        });
      }
      continue;
    }
    pushRefIssues(expr, doc, sourceIds, 'binding', field);
  }
}

export function refsOf(expr: Expr): string[] {
  const refs: string[] = [];
  walkExpr(expr, (node) => {
    if (typeof node.ref === 'string') {
      refs.push(node.ref);
      return 'stop';
    }
    if (typeof node.tpl === 'string') {
      refs.push(...templateRefs(node.tpl));
      return 'stop';
    }
    if (typeof node.fn === 'string') {
      return 'walk';
    }
    return 'lit' in node ? 'stop' : 'walk';
  });
  return refs;
}

export function fnNamesOf(expr: Expr): string[] {
  const names: string[] = [];
  walkExpr(expr, (node) => {
    if (typeof node.fn === 'string') {
      names.push(node.fn);
    }
    if (typeof node.ref === 'string' || typeof node.tpl === 'string' || 'lit' in node) {
      return 'stop';
    }
    return 'walk';
  });
  return names;
}

function templateRefs(template: string): string[] {
  const refs: string[] = [];
  for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const token = (match[1] ?? '').trim();
    if (token !== '') {
      refs.push(token);
    }
  }
  return refs;
}

/**
 * Resolve a reference path's root and first key against the doc: `state.<key>`
 * must be declared, `sources.<id>`/`status.<id>` must name a source,
 * `derived.<name>` must be declared, and `event`/`row`/`org` are always valid.
 */
export function resolveRef(
  ref: string,
  doc: WidgetDoc,
  sourceIds: Set<string>,
  noun: 'binding' | 'reference',
): string | null {
  const segments = ref.split('.').map((segment) => segment.replace(ARRAY_INDEX_PATTERN, ''));
  const root = segments[0] ?? '';
  const head = segments[1] ?? null;
  switch (root) {
    case 'state':
      if (head === null) {
        return 'state reference must name a key';
      }
      return Object.hasOwn(doc.state, head)
        ? null
        : `state key "${head}" is not declared in doc.state`;
    case 'sources':
    case 'status':
      if (head === null) {
        return `${root} reference must name a source id`;
      }
      return sourceIds.has(head) ? null : `source "${head}" is not declared in doc.sources`;
    case 'derived':
      if (head === null) {
        return 'derived reference must name a value';
      }
      return Object.hasOwn(doc.derived, head)
        ? null
        : `derived value "${head}" is not declared in doc.derived`;
    case 'event':
    case 'row':
    case 'org':
      return null;
    default:
      return `unknown ${noun} root "${root}"`;
  }
}

export function derivedCycles(derived: Record<string, Expr>): string[][] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (name: string): void => {
    const status = state.get(name);
    if (status === 'done') {
      return;
    }
    if (status === 'visiting') {
      const start = stack.indexOf(name);
      cycles.push([...stack.slice(start), name]);
      return;
    }
    const expr = derived[name];
    if (expr === undefined) {
      return;
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const ref of refsOf(expr)) {
      const target = derivedNameOf(ref);
      if (target !== null && Object.hasOwn(derived, target)) {
        visit(target);
      }
    }
    stack.pop();
    state.set(name, 'done');
  };
  for (const name of Object.keys(derived)) {
    visit(name);
  }
  return cycles;
}

function derivedNameOf(ref: string): string | null {
  const segments = ref.split('.').map((segment) => segment.replace(ARRAY_INDEX_PATTERN, ''));
  return segments[0] === 'derived' ? (segments[1] ?? null) : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
