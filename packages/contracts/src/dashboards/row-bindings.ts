import type { Expr } from './expr.ts';

/** Prop that holds per-row expressions; the guard validates it and the renderer evaluates it. */
export const ROW_BINDINGS_PROP = 'rowBindings';

/**
 * Row bindings of an item's props: a name-to-expression map evaluated once per
 * row with that row as the `row` root. Null when the prop is absent or empty.
 */
export function rowBindingsOf(props: Record<string, unknown>): Record<string, Expr> | null {
  const bindings = props[ROW_BINDINGS_PROP];
  if (typeof bindings !== 'object' || bindings === null || Array.isArray(bindings)) {
    return null;
  }
  if (Object.keys(bindings).length === 0) {
    return null;
  }
  return bindings as Record<string, Expr>;
}
