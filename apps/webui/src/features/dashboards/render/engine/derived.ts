import type { Expr } from '@harnesys/contracts';
import type { ExprDiagnostic, ExprRoots } from './expr-eval';
import { evaluateExpr } from './expr-eval';
import { refsOfExpr } from './refs';

const DERIVED_ROOT = 'derived.';
const ARRAY_INDEX_PATTERN = /\[[^\]]*\]/g;

function derivedNamesOf(expr: Expr): string[] {
  const names = new Set<string>();
  for (const ref of refsOfExpr(expr)) {
    if (!ref.startsWith(DERIVED_ROOT)) {
      continue;
    }
    const head = (ref.slice(DERIVED_ROOT.length).split('.')[0] ?? '').replace(
      ARRAY_INDEX_PATTERN,
      '',
    );
    if (head !== '') {
      names.add(head);
    }
  }
  return [...names];
}

function evaluationOrder(defs: Record<string, Expr>, diagnostics: ExprDiagnostic[]): string[] {
  const marks = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const order: string[] = [];
  const visit = (name: string): void => {
    const mark = marks.get(name);
    if (mark === 'done') {
      return;
    }
    if (mark === 'visiting') {
      const start = stack.indexOf(name);
      const cycle = [...stack.slice(start === -1 ? 0 : start), name];
      diagnostics.push({
        path: `derived.${name}`,
        message: `derived cycle: ${cycle.join(' -> ')}`,
      });
      return;
    }
    const expr = defs[name];
    if (expr === undefined) {
      return;
    }
    marks.set(name, 'visiting');
    stack.push(name);
    for (const dependency of derivedNamesOf(expr)) {
      if (Object.hasOwn(defs, dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    marks.set(name, 'done');
    order.push(name);
  };
  for (const name of Object.keys(defs)) {
    visit(name);
  }
  return order;
}

export function evaluateDerived(
  defs: Record<string, Expr>,
  roots: ExprRoots,
  diagnostics: ExprDiagnostic[] = [],
): Record<string, unknown> {
  const derived: Record<string, unknown> = {};
  const scope: ExprRoots = { ...roots, derived };
  for (const name of evaluationOrder(defs, diagnostics)) {
    const expr = defs[name];
    if (expr === undefined) {
      continue;
    }
    const local: ExprDiagnostic[] = [];
    derived[name] = evaluateExpr(expr, scope, local);
    for (const entry of local) {
      diagnostics.push({
        path: entry.path === '' ? `derived.${name}` : `derived.${name}.${entry.path}`,
        message: entry.message,
      });
    }
  }
  return derived;
}
