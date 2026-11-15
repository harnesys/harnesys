import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { blocksToMarkdown } from './blocks-to-markdown.ts';
import { type Block, collectChildren, notionCall } from './notion-api.ts';
import {
  asNotionPage,
  type NotionPage,
  type PageProperty,
  pageToRef,
  type SearchEntry,
  searchEntry,
} from './page-props.ts';
import { optionalInt, optionalStr, requireStr } from './params.ts';

interface SearchResponse {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
}

interface DatabaseObject {
  id: string;
  url?: string;
  title?: Array<{ plain_text?: string }>;
  description?: Array<{ plain_text?: string }>;
  properties?: Record<string, unknown>;
}

interface SelectOption {
  name?: string;
}

function titleOf(object: { title?: Array<{ plain_text?: string }> }): string {
  let title = '';
  for (const item of object.title ?? []) {
    title += item.plain_text ?? '';
  }
  return title;
}

function nextCursorOf(response: { next_cursor?: string | null }): { nextCursor?: string } {
  const cursor = response.next_cursor;
  return typeof cursor === 'string' && cursor !== '' ? { nextCursor: cursor } : {};
}

const searchTool: ToolHandler = async (input, ctx) => {
  const query = optionalStr(input, 'query') ?? '';
  const objectType = optionalStr(input, 'objectType');
  const pageSize = optionalInt(input, 'pageSize', 1, 100) ?? 20;
  const startCursor = optionalStr(input, 'startCursor');
  const filter =
    objectType === 'page' || objectType === 'database'
      ? { value: objectType, property: 'object' }
      : undefined;
  const response = await notionCall<SearchResponse>(ctx, 'POST', '/v1/search', {
    query,
    page_size: pageSize,
    ...(filter === undefined ? {} : { filter }),
    ...(startCursor === undefined ? {} : { start_cursor: startCursor }),
  });
  const entries: SearchEntry[] = [];
  for (const object of response.results ?? []) {
    const entry = searchEntry(object);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return {
    results: entries,
    hasMore: response.has_more === true,
    ...nextCursorOf(response),
  };
};

const getPageTool: ToolHandler = async (input, ctx) => {
  const pageId = requireStr(input, 'pageId');
  const page = await notionCall<NotionPage>(ctx, 'GET', `/v1/pages/${pageId}`);
  const ref = pageToRef(page);
  return {
    pageId: ref.id,
    title: ref.title,
    url: ref.url,
    ...(ref.icon === undefined ? {} : { icon: ref.icon }),
    parent: ref.parent,
    properties: ref.properties,
  };
};

const getPageContentTool: ToolHandler = async (input, ctx) => {
  const pageId = requireStr(input, 'pageId');
  const maxDepth = optionalInt(input, 'maxDepth', 1, 5) ?? 3;
  const markdown = await renderChildren(ctx, pageId, 1, maxDepth);
  return {
    pageId,
    markdown,
    truncated: markdown.length > 0 && markdown.length >= 200000,
  };
};

async function renderChildren(
  ctx: AddonContext,
  blockId: string,
  depth: number,
  maxDepth: number,
): Promise<string> {
  const blocks = await collectChildren(ctx, blockId);
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(await renderBlock(ctx, block, depth, maxDepth));
  }
  return parts.filter((part) => part !== '').join('\n\n');
}

async function renderBlock(
  ctx: AddonContext,
  block: Block,
  depth: number,
  maxDepth: number,
): Promise<string> {
  const own = blocksToMarkdown([block]);
  const indent = '  '.repeat(depth - 1);
  const indented =
    depth === 1
      ? own
      : own
          .split('\n')
          .map((line) => (line === '' ? line : `${indent}${line}`))
          .join('\n');
  if (!block.has_children || depth >= maxDepth) {
    return indented;
  }
  const nested = await renderChildren(ctx, block.id, depth + 1, maxDepth);
  return nested === '' ? indented : `${indented}\n\n${nested}`;
}

const getDatabaseTool: ToolHandler = async (input, ctx) => {
  const databaseId = requireStr(input, 'databaseId');
  const db = await notionCall<DatabaseObject>(ctx, 'GET', `/v1/databases/${databaseId}`);
  const properties: Array<{ name: string; type: string; options?: string[] }> = [];
  for (const [name, value] of Object.entries(db.properties ?? {})) {
    const record = value as {
      type?: string;
      select?: { options?: SelectOption[] };
      multi_select?: { options?: SelectOption[] };
      status?: { options?: SelectOption[] };
    };
    const type = record.type ?? 'unknown';
    const options =
      record.select?.options ?? record.multi_select?.options ?? record.status?.options;
    properties.push({
      name,
      type,
      ...(options === undefined ? {} : { options: options.map((option) => option.name ?? '') }),
    });
  }
  return {
    databaseId: db.id,
    title: titleOf(db),
    url: db.url ?? '',
    description: titleOf({ title: db.description ?? [] }),
    properties,
  };
};

const queryDatabaseTool: ToolHandler = async (input, ctx) => {
  const databaseId = requireStr(input, 'databaseId');
  const pageSize = optionalInt(input, 'pageSize', 1, 100) ?? 20;
  const startCursor = optionalStr(input, 'startCursor');
  const filter = input.filter;
  const sorts = input.sorts;
  assertFilter(filter);
  assertSorts(sorts);
  const response = await notionCall<SearchResponse>(
    ctx,
    'POST',
    `/v1/databases/${databaseId}/query`,
    {
      page_size: pageSize,
      ...(filter === undefined || filter === null ? {} : { filter }),
      ...(Array.isArray(sorts) && sorts.length > 0 ? { sorts } : {}),
      ...(startCursor === undefined ? {} : { start_cursor: startCursor }),
    },
  );
  const rows: Array<{
    pageId: string;
    title: string;
    url: string;
    properties: PageProperty[];
  }> = [];
  for (const object of response.results ?? []) {
    const page = asNotionPage(object);
    if (page === null) {
      continue;
    }
    const ref = pageToRef(page);
    rows.push({
      pageId: ref.id,
      title: ref.title,
      url: ref.url,
      properties: ref.properties,
    });
  }
  return {
    rows,
    hasMore: response.has_more === true,
    ...nextCursorOf(response),
  };
};

function assertFilter(filter: unknown): void {
  if (filter === undefined || filter === null) {
    return;
  }
  if (typeof filter !== 'object' || Array.isArray(filter)) {
    throw new AddonError('invalid_params', {
      detail: 'filter must be a Notion filter object',
    });
  }
}

function assertSorts(sorts: unknown): void {
  if (sorts === undefined || sorts === null) {
    return;
  }
  if (!Array.isArray(sorts)) {
    throw new AddonError('invalid_params', {
      detail: 'sorts must be a Notion sorts array',
    });
  }
}

export const readTools: Record<string, ToolHandler> = {
  search: searchTool,
  get_page: getPageTool,
  get_page_content: getPageContentTool,
  get_database: getDatabaseTool,
  query_database: queryDatabaseTool,
};
