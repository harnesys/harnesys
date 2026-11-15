import type { AddonContext, DbRow } from '@harnesys/sdk';

export interface Bookmark {
  id: number;
  title: string;
  url: string;
  tag: string;
  createdAt: string;
}

export interface BookmarkInput {
  title: string;
  url: string;
  tag: string;
}

const SELECT = 'select id, title, url, tag, created_at as createdAt from bookmarks';

export async function insertBookmark(ctx: AddonContext, input: BookmarkInput): Promise<Bookmark> {
  const createdAt = new Date().toISOString();
  const result = await ctx.db.run(
    'insert into bookmarks (title, url, tag, created_at) values (?, ?, ?, ?)',
    [input.title, input.url, input.tag, createdAt],
  );
  return {
    id: Number(result.lastInsertRowid),
    title: input.title,
    url: input.url,
    tag: input.tag,
    createdAt,
  };
}

export async function listBookmarks(
  ctx: AddonContext,
  params: { limit: number; tag?: string },
): Promise<Bookmark[]> {
  const rows =
    params.tag === undefined
      ? await ctx.db.all(`${SELECT} order by id desc limit ?`, [params.limit])
      : await ctx.db.all(`${SELECT} where tag = ? order by id desc limit ?`, [
          params.tag,
          params.limit,
        ]);
  return rows.map(mapBookmark);
}

function mapBookmark(row: DbRow): Bookmark {
  return {
    id: Number(row.id ?? 0),
    title: String(row.title ?? ''),
    url: String(row.url ?? ''),
    tag: String(row.tag ?? ''),
    createdAt: String(row.createdAt ?? ''),
  };
}
