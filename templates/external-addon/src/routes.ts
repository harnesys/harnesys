import type { RouteHandler } from '@harnesys/sdk';
import { listBookmarks } from './store.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function queryLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export const items: RouteHandler = async (call, ctx) => {
  const rows = await listBookmarks(ctx, { limit: queryLimit(call.request.query.limit) });
  return { status: 200, body: { rows } };
};
