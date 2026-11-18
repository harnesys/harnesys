import type { Expr, WidgetItem } from '@harnesys/contracts';
import { refsOfExpr } from './refs';

const SOURCES_ROOT = 'sources.';
const DERIVED_ROOT = 'derived.';
const ARRAY_INDEX_PATTERN = /\[[^\]]*\]/g;

function pathHead(ref: string, root: string): string | null {
  if (!ref.startsWith(root)) {
    return null;
  }
  const rest = ref.slice(root.length);
  const end = rest.search(/[.[]/);
  const head = (end === -1 ? rest : rest.slice(0, end)).replace(ARRAY_INDEX_PATTERN, '');
  return head.length > 0 ? head : null;
}

export function dependenciesOf(item: WidgetItem, derived?: Record<string, Expr>): string[] {
  const queue: string[] = [];
  for (const expr of Object.values(item.bindings)) {
    queue.push(...refsOfExpr(expr, true));
  }
  if (item.visibleWhen !== undefined) {
    queue.push(...refsOfExpr(item.visibleWhen));
  }
  const ids = new Set<string>();
  const visitedDerived = new Set<string>();
  while (queue.length > 0) {
    const ref = queue.pop();
    if (ref === undefined) {
      continue;
    }
    const sourceId = pathHead(ref, SOURCES_ROOT);
    if (sourceId !== null) {
      ids.add(sourceId);
      continue;
    }
    const derivedName = pathHead(ref, DERIVED_ROOT);
    if (derivedName === null || derived === undefined || visitedDerived.has(derivedName)) {
      continue;
    }
    const expr = derived[derivedName];
    if (expr === undefined) {
      continue;
    }
    visitedDerived.add(derivedName);
    queue.push(...refsOfExpr(expr));
  }
  return [...ids];
}
