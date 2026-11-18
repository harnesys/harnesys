import type { Expr } from '@harnesys/contracts';
import { templateTokens } from './expr-eval';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collect(expr: unknown, bareStringIsRef: boolean, out: string[]): void {
  if (typeof expr === 'string') {
    if (bareStringIsRef) {
      out.push(expr);
    }
    return;
  }
  if (Array.isArray(expr)) {
    for (const entry of expr) {
      collect(entry, false, out);
    }
    return;
  }
  if (!isPlainObject(expr)) {
    return;
  }
  if (typeof expr.ref === 'string') {
    out.push(expr.ref);
    return;
  }
  if (typeof expr.tpl === 'string') {
    out.push(...templateTokens(expr.tpl));
    return;
  }
  if (Object.hasOwn(expr, 'lit')) {
    return;
  }
  if (Object.hasOwn(expr, 'fn')) {
    collect(expr.args, false, out);
    return;
  }
  for (const value of Object.values(expr)) {
    collect(value, false, out);
  }
}

export function refsOfExpr(expr: Expr, bareStringIsRef = false): string[] {
  const refs: string[] = [];
  collect(expr, bareStringIsRef, refs);
  return refs;
}
