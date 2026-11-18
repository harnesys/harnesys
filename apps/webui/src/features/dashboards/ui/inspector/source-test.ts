import type { Expr, WidgetSource } from '@harnesys/contracts';
import { testWidgetSource } from '@/shared/api/dashboards';
import { orgApiRequest } from '../../render/data/source-client';

export interface TestOutcome {
  ok: boolean;
  text: string;
}

/**
 * orgApi sources are fetched natively by the client (same session as the
 * app); external ones must go through the server invoke/proxy endpoint,
 * which resolves vault refs and enforces the egress guard.
 */
export async function runSourceTest(orgId: string, source: WidgetSource): Promise<TestOutcome> {
  if (source.kind === 'orgApi') {
    const json = await orgApiRequest({
      orgId,
      path: source.path,
      method: source.method,
      query: stringQuery(source.query),
      body: source.body,
    });
    return { ok: true, text: summarize(json) };
  }
  const outcome = await testWidgetSource(orgId, source);
  return {
    ok: outcome.ok,
    text: outcome.ok
      ? summarize(outcome.json)
      : `${outcome.error ?? 'Request failed'}${outcome.status ? ` (HTTP ${outcome.status})` : ''}`,
  };
}

/** The probe sends plain string literals; expression values are stringified. */
function stringQuery(query: Record<string, Expr> | undefined): Record<string, string> | undefined {
  if (!query) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}

/** Keep previews small: arrays collapse to their first row plus a count. */
function summarize(json: unknown): string {
  if (Array.isArray(json)) {
    return JSON.stringify({ count: json.length, first: json[0] ?? null }, null, 2);
  }
  if (isItemsEnvelope(json)) {
    const items = json.items;
    return JSON.stringify(
      { ...json, items: [items[0] ?? null, `...${items.length} rows`] },
      null,
      2,
    );
  }
  return JSON.stringify(json, null, 2) ?? 'null';
}

interface ItemsEnvelope {
  items: unknown[];
  [key: string]: unknown;
}

function isItemsEnvelope(json: unknown): json is ItemsEnvelope {
  return (
    json !== null &&
    typeof json === 'object' &&
    !Array.isArray(json) &&
    Array.isArray((json as { items?: unknown }).items)
  );
}
