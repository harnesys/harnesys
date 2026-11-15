import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';

const API_ROOT = 'https://api.notion.com';
const NOTION_VERSION = '2022-06-28';
export const TOKEN_KEY = 'token';

export interface Block {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface ChildrenPage {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export async function requireToken(ctx: AddonContext): Promise<string> {
  const token = await ctx.secrets.get(TOKEN_KEY);
  if (token === null || token.trim() === '') {
    throw new AddonError('account_failed', {
      accountCode: 'not_configured',
      detail:
        'no Notion integration token configured; set the Notion integration token in the add-on config on the add-on card',
    });
  }
  return token.trim();
}

function parseBody(body: string | null): Record<string, unknown> {
  if (body === null || body === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export async function notionCall<T>(
  ctx: AddonContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await requireToken(ctx);
  const response = await ctx.http.fetch({
    url: `${API_ROOT}${path}`,
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'notion-version': NOTION_VERSION,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = parseBody(response.body);
  if (response.status >= 200 && response.status < 300) {
    return parsed as T;
  }
  const message = parsed.message;
  const detail =
    typeof message === 'string' && message !== ''
      ? message
      : `Notion API returned status ${response.status}`;
  if (response.status === 400) {
    throw new AddonError('invalid_params', { detail });
  }
  if (response.status === 401 || response.status === 403) {
    throw new AddonError('account_failed', {
      accountCode: 'unauthorized',
      detail,
    });
  }
  if (response.status === 404) {
    throw new AddonError('not_found', { detail });
  }
  if (response.status === 409) {
    throw new AddonError('conflict', { detail });
  }
  if (response.status === 429) {
    throw new AddonError('rate_limited', { detail, retryable: true });
  }
  if (response.status >= 500) {
    throw new AddonError('unavailable', { detail, retryable: true });
  }
  throw new AddonError('internal', { detail });
}

export function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const block = value as Record<string, unknown>;
  return typeof block.id === 'string' && typeof block.type === 'string';
}

export async function collectChildren(ctx: AddonContext, blockId: string): Promise<Block[]> {
  const id = blockId.replace(/-/g, '');
  const blocks: Block[] = [];
  let cursor: string | undefined;
  for (;;) {
    const suffix = cursor === undefined ? '' : `&start_cursor=${encodeURIComponent(cursor)}`;
    const page = await notionCall<ChildrenPage>(
      ctx,
      'GET',
      `/v1/blocks/${id}/children?page_size=100${suffix}`,
    );
    const results = Array.isArray(page.results) ? page.results : [];
    for (const entry of results) {
      if (isBlock(entry)) {
        blocks.push(entry);
      }
    }
    if (page.has_more !== true || typeof page.next_cursor !== 'string' || page.next_cursor === '') {
      return blocks;
    }
    cursor = page.next_cursor;
  }
}
