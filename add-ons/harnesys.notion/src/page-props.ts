import { AddonError } from '@harnesys/sdk';

export interface PageProperty {
  name: string;
  type: string;
  value: string;
}

export interface PageRef {
  id: string;
  title: string;
  url: string;
  icon: string | undefined;
  parent: string;
  properties: PageProperty[];
}

export interface PropertyValue {
  type: string;
  id?: string;
  [key: string]: unknown;
}

interface NotionIcon {
  type: string;
  emoji?: string;
  external?: { url?: string };
}

export interface NotionPage {
  id: string;
  url?: string;
  archived?: boolean;
  icon?: NotionIcon | null;
  parent?: Record<string, unknown>;
  properties?: Record<string, PropertyValue>;
}

export type SearchKind = 'page' | 'database';

export interface SearchEntry {
  id: string;
  type: SearchKind;
  title: string;
  url: string;
}

interface SearchObject {
  id?: unknown;
  object?: unknown;
  url?: unknown;
  properties?: Record<string, PropertyValue>;
  title?: Array<{ plain_text?: string }>;
}

const TEXT_TYPES = new Set(['title', 'rich_text', 'email', 'phone_number', 'url']);
const NAME_LIST_TYPES = new Set(['people', 'files']);

export function normalizeId(raw: string): string {
  const id = raw.trim().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    throw new AddonError('invalid_params', {
      detail: `${raw} is not a Notion page, database or block id (32 hex chars, dashes optional)`,
    });
  }
  return id;
}

export function asNotionPage(value: unknown): NotionPage | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as NotionPage;
  return typeof record.id === 'string' ? record : null;
}

function nameOf(value: unknown): string {
  const record = value as { name?: string } | undefined;
  return record?.name ?? '';
}

function namesOf(value: unknown): string {
  const items = value as Array<{ name?: string }> | undefined;
  return (items ?? []).map((item) => item.name ?? '').join(', ');
}

function numberText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function stringText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateText(value: unknown): string {
  const date = value as { start?: string; end?: string | null } | undefined;
  const start = date?.start;
  if (start === undefined) {
    return '';
  }
  return date?.end ? `${start} → ${date.end}` : start;
}

function uniqueIdText(value: unknown): string {
  const uid = value as { prefix?: string; number?: number } | undefined;
  if (uid === undefined) {
    return '';
  }
  const prefix = uid.prefix === undefined || uid.prefix === '' ? '' : `${uid.prefix}-`;
  return `${prefix}${uid.number ?? ''}`;
}

function plainList(items: unknown): string {
  if (!Array.isArray(items)) {
    return '';
  }
  let out = '';
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const rich = item as { plain_text?: string; text?: { content?: string } };
    out += rich.text?.content ?? rich.plain_text ?? '';
  }
  return out;
}

function propertyText(value: PropertyValue): string {
  const type = value.type;
  if (TEXT_TYPES.has(type)) {
    return plainList(value[type]);
  }
  if (type === 'select' || type === 'status') {
    return nameOf(value[type]);
  }
  if (type === 'multi_select') {
    return namesOf(value.multi_select);
  }
  if (type === 'number') {
    return numberText(value.number);
  }
  if (type === 'checkbox') {
    return value.checkbox === true ? 'true' : 'false';
  }
  if (type === 'date') {
    return dateText(value.date);
  }
  if (NAME_LIST_TYPES.has(type)) {
    return namesOf(value[type]);
  }
  if (type === 'created_time' || type === 'last_edited_time') {
    return stringText(value[type]);
  }
  if (type === 'unique_id') {
    return uniqueIdText(value.unique_id);
  }
  return type;
}

function parentLabel(parent: Record<string, unknown> | undefined): string {
  if (parent === undefined) {
    return '';
  }
  if (typeof parent.page_id === 'string') {
    return `page ${parent.page_id}`;
  }
  if (typeof parent.database_id === 'string') {
    return `database ${parent.database_id}`;
  }
  if (parent.type === 'workspace') {
    return 'workspace';
  }
  return String(parent.type ?? '');
}

function iconOf(icon: NotionIcon | null | undefined): string | undefined {
  if (icon?.type === 'emoji') {
    return icon.emoji;
  }
  if (icon?.type === 'external') {
    return icon.external?.url;
  }
  return undefined;
}

export function pageToRef(page: NotionPage): PageRef {
  const properties: PageProperty[] = [];
  let title = '';
  for (const [name, value] of Object.entries(page.properties ?? {})) {
    const text = propertyText(value);
    if (value.type === 'title' && title === '') {
      title = text;
    }
    properties.push({ name, type: value.type, value: text });
  }
  return {
    id: page.id,
    title,
    url: page.url ?? '',
    icon: iconOf(page.icon),
    parent: parentLabel(page.parent),
    properties,
  };
}

export function titlePropertyId(
  properties: Record<string, { type?: string }> | undefined,
): string | undefined {
  if (properties === undefined) {
    return undefined;
  }
  for (const [name, value] of Object.entries(properties)) {
    if (value.type === 'title') {
      return name;
    }
  }
  return undefined;
}

export function simpleProperty(name: string, value: unknown): PropertyValue {
  if (typeof value === 'boolean') {
    return { type: 'checkbox', checkbox: value };
  }
  if (typeof value === 'number') {
    return { type: 'number', number: value };
  }
  if (typeof value === 'string') {
    return {
      type: 'rich_text',
      rich_text: [{ type: 'text', text: { content: value } }],
    };
  }
  throw new AddonError('invalid_params', {
    detail: `property "${name}" must be a string, number or boolean; use rawProperties for advanced Notion property objects`,
  });
}

function searchKind(objectType: unknown): SearchKind | null {
  if (objectType === 'page' || objectType === 'database') {
    return objectType;
  }
  return null;
}

function databaseTitle(object: SearchObject): string {
  let title = '';
  for (const item of object.title ?? []) {
    title += item.plain_text ?? '';
  }
  return title;
}

export function searchEntry(value: unknown): SearchEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const object = value as SearchObject;
  if (typeof object.id !== 'string') {
    return null;
  }
  const kind = searchKind(object.object);
  if (kind === null) {
    return null;
  }
  const title = kind === 'page' ? pageTitle(object.properties) : databaseTitle(object);
  return {
    id: object.id,
    type: kind,
    title,
    url: typeof object.url === 'string' ? object.url : '',
  };
}

export function pageTitle(properties: Record<string, PropertyValue> | undefined): string {
  if (properties === undefined) {
    return '';
  }
  for (const value of Object.values(properties)) {
    if (value.type === 'title') {
      return plainList(value.title);
    }
  }
  return '';
}
