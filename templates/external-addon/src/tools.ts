import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { insertBookmark, listBookmarks } from './store.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function limitOf(input: Record<string, unknown>): number {
  const raw = input.limit;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw)));
}

async function defaultTag(ctx: AddonContext): Promise<string> {
  const config = await ctx.config.get(['default_tag']);
  return typeof config.default_tag === 'string' ? config.default_tag : '';
}

export const bookmarks: Record<string, ToolHandler> = {
  add: async (input, ctx) => {
    const tag = optionalString(input, 'tag') ?? (await defaultTag(ctx));
    const bookmark = await insertBookmark(ctx, {
      title: requiredString(input, 'title'),
      url: requiredString(input, 'url'),
      tag,
    });
    await ctx.log.info('bookmark saved', { id: bookmark.id, tag: bookmark.tag });
    return bookmark;
  },
  list: async (input, ctx) => {
    const rows = await listBookmarks(ctx, {
      limit: limitOf(input),
      tag: optionalString(input, 'tag'),
    });
    return { rows };
  },
};
