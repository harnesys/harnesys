import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { codeLanguage, markdownToBlocks } from './markdown-to-blocks.ts';
import { notionCall } from './notion-api.ts';
import { normalizeId, type PropertyValue, simpleProperty, titlePropertyId } from './page-props.ts';
import { optionalBool, optionalRecord, optionalStr, requireEnum, requireStr } from './params.ts';

interface CreatePageResponse {
  id: string;
  url?: string;
}

interface DatabaseSchema {
  properties?: Record<string, { type?: string }>;
}

function buildProperties(input: Record<string, unknown>): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  const simple = optionalRecord(input, 'properties');
  if (simple !== undefined) {
    for (const [name, value] of Object.entries(simple)) {
      out[name] = simpleProperty(name, value);
    }
  }
  const raw = optionalRecord(input, 'rawProperties');
  if (raw !== undefined) {
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new AddonError('invalid_params', {
          detail: `rawProperties["${name}"] must be a Notion property object`,
        });
      }
      out[name] = value as PropertyValue;
    }
  }
  return out;
}

function titleProperty(text: string): PropertyValue {
  return { type: 'title', title: [{ type: 'text', text: { content: text } }] };
}

async function databaseSchema(
  ctx: AddonContext,
  databaseId: string,
): Promise<{ titleKey: string | undefined; types: Record<string, string> }> {
  const db = await notionCall<DatabaseSchema>(ctx, 'GET', `/v1/databases/${databaseId}`);
  const types: Record<string, string> = {};
  let titleKey: string | undefined;
  for (const [name, value] of Object.entries(db.properties ?? {})) {
    types[name] = value.type ?? 'unknown';
    if (value.type === 'title') {
      titleKey = name;
    }
  }
  return { titleKey, types };
}

function coerceToColumnType(
  properties: Record<string, PropertyValue>,
  name: string,
  target: string | undefined,
): void {
  const value = properties[name];
  if (value === undefined || value.type !== 'rich_text' || target === undefined) {
    return;
  }
  const text = (value.rich_text as Array<{ text?: { content?: string } }> | undefined)?.[0]?.text
    ?.content;
  if (text === undefined) {
    return;
  }
  if (target === 'select' || target === 'status') {
    properties[name] = { type: target, [target]: { name: text } };
    return;
  }
  if (target === 'multi_select') {
    properties[name] = { type: 'multi_select', multi_select: [{ name: text }] };
  }
}

async function resolveDatabaseProperties(
  ctx: AddonContext,
  databaseId: string,
  title: string | undefined,
  properties: Record<string, PropertyValue>,
): Promise<void> {
  const schema = await databaseSchema(ctx, databaseId);
  const titleKey = titlePropertyOf(properties) ?? schema.titleKey;
  if (titleKey === undefined) {
    throw new AddonError('invalid_params', {
      detail: `database ${databaseId} has no title column`,
    });
  }
  if (title !== undefined && title !== '') {
    properties[titleKey] = titleProperty(title);
  }
  for (const name of Object.keys(properties)) {
    coerceToColumnType(properties, name, schema.types[name]);
  }
}

const createPageTool: ToolHandler = async (input, ctx) => {
  const parentType = requireEnum(input, 'parentType', ['database_id', 'page_id'] as const);
  const parentId = normalizeId(requireStr(input, 'parentId'));
  const title = optionalStr(input, 'title');
  const content = optionalStr(input, 'content');
  const icon = optionalStr(input, 'icon');
  const properties = buildProperties(input);

  if (parentType === 'database_id') {
    await resolveDatabaseProperties(ctx, parentId, title, properties);
  } else if (title !== undefined && title !== '') {
    properties.title = titleProperty(title);
  }

  const children = content === undefined || content === '' ? [] : markdownToBlocks(content);
  const page = await notionCall<CreatePageResponse>(ctx, 'POST', '/v1/pages', {
    parent: { [parentType]: parentId },
    properties,
    ...(children.length === 0 ? {} : { children }),
    ...(icon === undefined || icon === '' ? {} : { icon: { type: 'emoji', emoji: icon } }),
  });
  return { pageId: page.id, url: page.url ?? '', title: title ?? '' };
};

function titlePropertyOf(properties: Record<string, PropertyValue>): string | undefined {
  for (const [name, value] of Object.entries(properties)) {
    if (value.type === 'title') {
      return name;
    }
  }
  return undefined;
}

const updatePageTool: ToolHandler = async (input, ctx) => {
  const pageId = normalizeId(requireStr(input, 'pageId'));
  const title = optionalStr(input, 'title');
  const icon = optionalStr(input, 'icon');
  const archived = optionalBool(input, 'archived');
  const properties = buildProperties(input);

  if (title !== undefined && title !== '' && titlePropertyOf(properties) === undefined) {
    const page = await notionCall<Record<string, unknown>>(ctx, 'GET', `/v1/pages/${pageId}`);
    const titleKey = titlePropertyId(
      page.properties as Record<string, { type?: string }> | undefined,
    );
    if (titleKey === undefined) {
      throw new AddonError('invalid_params', {
        detail: `page ${pageId} has no title property to update`,
      });
    }
    properties[titleKey] = titleProperty(title);
  }

  const page = await notionCall<CreatePageResponse>(ctx, 'PATCH', `/v1/pages/${pageId}`, {
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
    ...(icon === undefined || icon === '' ? {} : { icon: { type: 'emoji', emoji: icon } }),
    ...(archived === undefined ? {} : { archived }),
  });
  return {
    pageId: page.id,
    url: page.url ?? '',
    archived: archived ?? undefined,
  };
};

const appendBlocksTool: ToolHandler = async (input, ctx) => {
  const pageId = normalizeId(requireStr(input, 'pageId'));
  const content = requireStr(input, 'content');
  const children = markdownToBlocks(content);
  if (children.length === 0) {
    throw new AddonError('invalid_params', {
      detail: 'content produced no blocks',
    });
  }
  await notionCall(ctx, 'PATCH', `/v1/blocks/${pageId}/children`, { children });
  return { pageId, appended: children.length };
};

const UPDATABLE_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'code',
  'callout',
]);

interface FetchedBlock {
  id: string;
  type?: string;
}

async function updatableBlockType(ctx: AddonContext, blockId: string): Promise<string> {
  const block = await notionCall<FetchedBlock>(ctx, 'GET', `/v1/blocks/${blockId}`);
  const type = block.type;
  if (typeof type !== 'string' || !UPDATABLE_BLOCK_TYPES.has(type)) {
    throw new AddonError('unsupported', {
      detail: `block ${blockId} has type ${type ?? 'unknown'}, which cannot be updated; updatable types: ${[...UPDATABLE_BLOCK_TYPES].join(', ')}`,
    });
  }
  return type;
}

const updateBlockTool: ToolHandler = async (input, ctx) => {
  const blockId = normalizeId(requireStr(input, 'blockId'));
  const content = optionalStr(input, 'content');
  const checked = optionalBool(input, 'checked');
  const language = optionalStr(input, 'language');
  const type = await updatableBlockType(ctx, blockId);
  const payload: Record<string, unknown> = {};
  if (content !== undefined) {
    payload.rich_text = [{ type: 'text', text: { content } }];
  }
  if (type === 'to_do' && checked !== undefined) {
    payload.checked = checked;
  }
  if (type === 'code' && language !== undefined) {
    payload.language = codeLanguage(language);
  }
  if (Object.keys(payload).length === 0) {
    throw new AddonError('invalid_params', {
      detail:
        'nothing to change: pass content, or checked for a to-do block, or language for a code block',
    });
  }
  await notionCall(ctx, 'PATCH', `/v1/blocks/${blockId}`, { [type]: payload });
  return { blockId, type, updated: true };
};

const deleteBlockTool: ToolHandler = async (input, ctx) => {
  const blockId = normalizeId(requireStr(input, 'blockId'));
  await notionCall(ctx, 'DELETE', `/v1/blocks/${blockId}`);
  return { blockId, deleted: true };
};

export const writeTools: Record<string, ToolHandler> = {
  create_page: createPageTool,
  update_page: updatePageTool,
  append_blocks: appendBlocksTool,
  update_block: updateBlockTool,
  delete_block: deleteBlockTool,
};
