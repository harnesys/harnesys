import type { Expr, ExprFnName } from '@harnesys/contracts';
import { EXPR_FN_SIGNATURES } from '@harnesys/contracts';
import type { ExprFn } from './fns';
import { EXPR_FNS } from './fns';
import { isTruthy } from './fns/values';
import { readPath } from './path';

export interface WidgetSourceStatus {
  loading: boolean;
  error: string | null;
}

export interface ExprRoots {
  state: Record<string, unknown>;
  sources: Record<string, unknown>;
  status: Record<string, WidgetSourceStatus>;
  derived: Record<string, unknown>;
  event: unknown;
  row: unknown;
  org: { id: string };
}

export interface ExprDiagnostic {
  path: string;
  message: string;
}

const LAZY_FN_NAMES: ReadonlySet<ExprFnName> = new Set(['if', 'and', 'or', 'coalesce']);

const TEMPLATE_TOKEN_PATTERN = /\{\{([^{}]*)\}\}/g;
const REF_PATH_PATTERN = /^[A-Za-z0-9_$-]+(?:\[\d+\])*(?:\.[A-Za-z0-9_$-]+(?:\[\d+\])*)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withPath(base: string, segment: string): string {
  return base === '' ? segment : `${base}.${segment}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function templateTokens(template: string): string[] {
  const tokens: string[] = [];
  for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    tokens.push((match[1] ?? '').trim());
  }
  return tokens;
}

function tokenText(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function evaluateTemplate(
  template: string,
  roots: ExprRoots,
  path: string,
  diagnostics: ExprDiagnostic[],
): string | null {
  const remainder = template.replace(TEMPLATE_TOKEN_PATTERN, '');
  if (remainder.includes('{') || remainder.includes('}')) {
    diagnostics.push({ path, message: 'template braces are unbalanced' });
    return null;
  }
  let failed = false;
  const rendered = template.replace(TEMPLATE_TOKEN_PATTERN, (match: string, raw: string) => {
    const token = raw.trim();
    if (!REF_PATH_PATTERN.test(token)) {
      diagnostics.push({ path, message: `template token "${token}" is not a reference path` });
      failed = true;
      return match;
    }
    const value = readPath(roots, token);
    if (value === null || value === undefined) {
      diagnostics.push({ path, message: `template token "${token}" resolved to null` });
      failed = true;
      return match;
    }
    return tokenText(value);
  });
  return failed ? null : rendered;
}

function arityText(fnName: ExprFnName): string {
  const signature = EXPR_FN_SIGNATURES[fnName];
  const max = signature.maxArgs === Number.POSITIVE_INFINITY ? '' : `..${signature.maxArgs}`;
  return `${signature.minArgs}${max}`;
}

function evaluateArgs(
  args: readonly unknown[],
  roots: ExprRoots,
  path: string,
  diagnostics: ExprDiagnostic[],
): unknown[] {
  return args.map((arg, index) => walk(arg, roots, withPath(path, `args[${index}]`), diagnostics));
}

function evaluateLazyArgs(
  fnName: ExprFnName,
  args: readonly unknown[],
  roots: ExprRoots,
  path: string,
  diagnostics: ExprDiagnostic[],
): unknown[] {
  const read = (index: number): unknown =>
    walk(args[index], roots, withPath(path, `args[${index}]`), diagnostics);
  if (fnName === 'if') {
    const condition = read(0);
    if (isTruthy(condition)) {
      return [condition, args.length > 1 ? read(1) : undefined];
    }
    return [condition, undefined, args.length > 2 ? read(2) : undefined];
  }
  const values: unknown[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = read(index);
    values.push(value);
    if (fnName === 'and' && !isTruthy(value)) {
      break;
    }
    if (fnName === 'or' && isTruthy(value)) {
      break;
    }
    if (fnName === 'coalesce' && value !== null && value !== undefined) {
      break;
    }
  }
  return values;
}

function evaluateFn(
  node: Record<string, unknown>,
  roots: ExprRoots,
  path: string,
  diagnostics: ExprDiagnostic[],
): unknown {
  const name = node.fn;
  if (typeof name !== 'string' || !Object.hasOwn(EXPR_FN_SIGNATURES, name)) {
    diagnostics.push({ path, message: `unknown expr fn "${String(name)}"` });
    return null;
  }
  const fnName = name as ExprFnName;
  if (!Array.isArray(node.args)) {
    diagnostics.push({ path, message: `${fnName} args must be an array` });
    return null;
  }
  const signature = EXPR_FN_SIGNATURES[fnName];
  const maxArgs = signature.maxArgs;
  if (node.args.length < signature.minArgs || node.args.length > maxArgs) {
    diagnostics.push({
      path,
      message: `${fnName} expects ${arityText(fnName)} arguments, received ${node.args.length}`,
    });
    return null;
  }
  const implementation: ExprFn | undefined = EXPR_FNS[fnName];
  if (implementation === undefined) {
    diagnostics.push({ path, message: `no implementation for expr fn "${fnName}"` });
    return null;
  }
  const values = LAZY_FN_NAMES.has(fnName)
    ? evaluateLazyArgs(fnName, node.args, roots, path, diagnostics)
    : evaluateArgs(node.args, roots, path, diagnostics);
  try {
    return implementation(values);
  } catch (error) {
    diagnostics.push({ path, message: `${fnName} failed: ${messageOf(error)}` });
    return null;
  }
}

function walk(
  expr: unknown,
  roots: ExprRoots,
  path: string,
  diagnostics: ExprDiagnostic[],
): unknown {
  if (Array.isArray(expr)) {
    return expr.map((entry, index) => walk(entry, roots, `${path}[${index}]`, diagnostics));
  }
  if (!isPlainObject(expr)) {
    return expr;
  }
  if (Object.hasOwn(expr, 'ref')) {
    if (typeof expr.ref !== 'string') {
      diagnostics.push({ path, message: 'ref must be a path string' });
      return null;
    }
    return readPath(roots, expr.ref) ?? null;
  }
  if (Object.hasOwn(expr, 'lit')) {
    return expr.lit;
  }
  if (Object.hasOwn(expr, 'tpl')) {
    if (typeof expr.tpl !== 'string') {
      diagnostics.push({ path, message: 'tpl must be a string' });
      return null;
    }
    return evaluateTemplate(expr.tpl, roots, path, diagnostics);
  }
  if (Object.hasOwn(expr, 'fn')) {
    return evaluateFn(expr, roots, path, diagnostics);
  }
  const walked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(expr)) {
    walked[key] = walk(value, roots, withPath(path, key), diagnostics);
  }
  return walked;
}

export function evaluateExpr(
  expr: Expr,
  roots: ExprRoots,
  diagnostics: ExprDiagnostic[] = [],
): unknown {
  return walk(expr, roots, '', diagnostics);
}

export function evaluateBinding(
  expr: Expr,
  roots: ExprRoots,
  diagnostics: ExprDiagnostic[] = [],
): unknown {
  if (typeof expr === 'string') {
    return readPath(roots, expr) ?? null;
  }
  return evaluateExpr(expr, roots, diagnostics);
}
