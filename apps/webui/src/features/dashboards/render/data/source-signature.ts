import type { Expr, WidgetSource } from '@harnesys/contracts';
import type { ExprRoots, WidgetSourceStatus } from '../engine/expr-eval';
import { evaluateExpr } from '../engine/expr-eval';
import { toQueryRecord } from '../engine/query';
import { sourceParams } from './source-params';

export type RefreshMode = 'manual' | 'onMount' | 'interval' | 'onEvent';

export function refreshModeOf(source: WidgetSource): RefreshMode {
  return source.refresh?.mode ?? 'onMount';
}

export function errorOf(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request aborted';
  }
  return error instanceof Error ? error.message : String(error);
}

export function queryRoots(orgId: string, getState?: () => Record<string, unknown>): ExprRoots {
  return {
    state: getState?.() ?? {},
    sources: {},
    status: {},
    derived: {},
    event: null,
    row: null,
    org: { id: orgId },
  };
}

export function resolveQuery(
  query: Record<string, Expr> | undefined,
  roots: ExprRoots,
): Record<string, string> | undefined {
  if (!query) {
    return undefined;
  }
  const resolved: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(query)) {
    resolved[key] = evaluateExpr(expr, roots);
  }
  return toQueryRecord(resolved);
}

/** Resolved request fingerprint of one source: everything that changes the response. */
export function sourceSignature(source: WidgetSource, roots: ExprRoots): string {
  return JSON.stringify({
    query: source.query === undefined ? null : resolveQuery(source.query, roots),
    body: source.body === undefined ? null : evaluateExpr(source.body, roots),
    params: source.kind === 'external' ? sourceParams(source, roots.state) : null,
  });
}

export function errorsOf(status: Record<string, WidgetSourceStatus>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [id, entry] of Object.entries(status)) {
    if (entry.error !== null) {
      errors[id] = entry.error;
    }
  }
  return errors;
}
