import type { WidgetParams } from '@harnesys/contracts';
import { parseOrgApiPath } from '@harnesys/contracts';
import { apiJson } from '@/shared/api/client';

/**
 * Server response envelope of the widget invoke endpoint. Secrets never reach
 * the browser: the server resolves vault refs and returns only the JSON body.
 */
export interface WidgetInvokeResult {
  ok: boolean;
  status?: number;
  json?: unknown;
  fetchedAt?: string;
  cacheHit?: boolean;
  error?: string;
  /** Param named by a `param_missing` error. */
  param?: string;
}

export interface WidgetApiCallInput {
  path: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Aborting supersedes a stale source fetch; the caller owns the controller. */
  signal?: AbortSignal;
}

/**
 * The app convention prefixes REST paths with `/api`. Widget doc source paths
 * are stored unprefixed (`/orgs/...` per the contracts path guard); normalize here
 * so both stored and hand-written `/api/...` paths work.
 */
export function normalizeApiPath(path: string): string {
  return path.startsWith('/api/') ? path : `/api${path}`;
}

function appendQuery(path: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${new URLSearchParams(query).toString()}`;
}

/**
 * Same-origin org API call with the app's session auth (apiJson adds headers).
 * Every widget-initiated call (sources, actions) is re-checked against the
 * shared path guard: structure plus the widget's own org. There is no prefix
 * allow-list (D2), so the check is traversal/encoding/foreign-org only.
 */
export async function orgApiRequest(
  input: WidgetApiCallInput & { orgId: string },
): Promise<unknown> {
  const normalized = normalizeApiPath(input.path);
  const apiPrefix = '/api';
  const unprefixed = normalized.startsWith(apiPrefix)
    ? normalized.slice(apiPrefix.length)
    : normalized;
  const checked = parseOrgApiPath(unprefixed, input.orgId);
  if (!checked.ok) {
    throw new Error(`Widget API call rejected: ${checked.reason}`);
  }
  return apiJson<unknown>(appendQuery(normalized, input.query), {
    method: input.method ?? 'GET',
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
}

/**
 * External sources go through the server invoke endpoint: the single audit
 * point, secret resolution and TTL cache live server-side. `params` are the
 * scalars the server substitutes into `{{param:name}}` in query and body.
 */
export interface WidgetInvokeInput {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  sourceId: string;
  params?: WidgetParams;
  /** Aborting supersedes a stale source fetch; the caller owns the controller. */
  signal?: AbortSignal;
}

export async function invokeExternalSource(input: WidgetInvokeInput): Promise<WidgetInvokeResult> {
  const { orgId, dashboardId, widgetId, sourceId, params, signal } = input;
  const body = params === undefined ? { sourceId } : { sourceId, params };
  return apiJson<WidgetInvokeResult>(
    normalizeApiPath(`/orgs/${orgId}/dashboards/${dashboardId}/widgets/${widgetId}/invoke`),
    { method: 'POST', body: JSON.stringify(body), signal },
  );
}
