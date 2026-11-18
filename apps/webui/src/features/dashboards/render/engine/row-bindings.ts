import type { Expr } from '@harnesys/contracts';
import { rowBindingsOf } from '@harnesys/contracts';
import type { ExprRoots } from './expr-eval';
import { evaluateBinding } from './expr-eval';

export const EXPR_ROOTS_PROP = 'exprRoots';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExprRoots(value: unknown): value is ExprRoots {
  return (
    isPlainObject(value) &&
    isPlainObject(value.state) &&
    isPlainObject(value.sources) &&
    isPlainObject(value.org)
  );
}

function exprRootsOf(props: Record<string, unknown>): ExprRoots | null {
  const roots = props[EXPR_ROOTS_PROP];
  return isExprRoots(roots) ? roots : null;
}

function evaluateRowBindings(
  bindings: Record<string, Expr>,
  row: unknown,
  roots: ExprRoots,
): Record<string, unknown> {
  const scope: ExprRoots = { ...roots, row };
  const resolved: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(bindings)) {
    resolved[key] = evaluateBinding(expr, scope);
  }
  return resolved;
}

export function withRowBindings<T>(
  items: readonly T[],
  props: Record<string, unknown>,
): readonly T[] {
  const bindings = rowBindingsOf(props);
  const roots = exprRootsOf(props);
  if (bindings === null || roots === null) {
    return items;
  }
  return items.map((item) => {
    if (!isPlainObject(item)) {
      return item;
    }
    return { ...item, ...evaluateRowBindings(bindings, item, roots) };
  });
}
