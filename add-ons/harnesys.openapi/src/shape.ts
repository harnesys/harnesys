import { AddonError } from '@harnesys/sdk';
import { byteLength, responsePayload, truncateText } from './truncate.ts';
import type { HttpResponse } from './types.ts';

const FIELDS_MAX_KEYS = 32;
const PREVIEW_LIMIT_DEFAULT = 3;
const PREVIEW_LIMIT_MAX = 10;
const WRITE_CHUNK_BYTES = 2 * 1024 * 1024;

export interface ShapingContext {
  readonly meta: { threadId?: string };
  readonly files: {
    locate(params: { scope: 'thread' | 'workspace' }): Promise<{ path: string }>;
    write(params: {
      path: string;
      data: string;
      append?: boolean;
    }): Promise<{ path: string; size: number }>;
  };
}

export interface ResponseShape {
  fields: string[] | null;
  saveToFile: boolean;
  previewLimit: number;
}

export function parseResponseShape(input: Record<string, unknown>): ResponseShape | null {
  const hasFields = input.fields !== undefined && input.fields !== null;
  const hasSave = input.saveToFile !== undefined && input.saveToFile !== null;
  const hasPreview = input.previewLimit !== undefined && input.previewLimit !== null;
  if (!hasFields && !hasSave && !hasPreview) {
    return null;
  }
  if (input.saveToFile !== undefined && typeof input.saveToFile !== 'boolean') {
    throw new AddonError('invalid_params', { detail: 'saveToFile must be a boolean' });
  }
  const saveToFile = input.saveToFile === true;
  if (hasPreview && !saveToFile) {
    throw new AddonError('invalid_params', { detail: 'previewLimit only applies with saveToFile' });
  }
  return {
    fields: hasFields ? parseFields(input.fields) : null,
    saveToFile,
    previewLimit: parsePreviewLimit(input.previewLimit),
  };
}

function parseFields(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AddonError('invalid_params', {
      detail: 'fields must be a non-empty array of record keys, e.g. ["id","slug","name"]',
    });
  }
  const fields: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.length === 0) {
      throw new AddonError('invalid_params', {
        detail: 'fields must list non-empty strings, e.g. ["id","slug","name"]',
      });
    }
    if (!fields.includes(item)) {
      fields.push(item);
    }
  }
  if (fields.length > FIELDS_MAX_KEYS) {
    throw new AddonError('invalid_params', {
      detail: `fields accepts at most ${FIELDS_MAX_KEYS} keys`,
    });
  }
  return fields;
}

function parsePreviewLimit(raw: unknown): number {
  if (raw === undefined || raw === null) {
    return PREVIEW_LIMIT_DEFAULT;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new AddonError('invalid_params', { detail: 'previewLimit must be a number' });
  }
  return Math.min(PREVIEW_LIMIT_MAX, Math.max(1, Math.floor(raw)));
}

export function parseJsonBody(rawBody: string | null): unknown {
  if (rawBody === null || rawBody.length === 0) {
    return undefined;
  }
  const head = rawBody.slice(0, 1);
  if (head !== '{' && head !== '[') {
    return undefined;
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return undefined;
  }
}

export function projectRecords(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      isPlainObject(item) ? pickFields(item, fields) : projectRecords(item, fields),
    );
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const mapped: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    mapped[key] = projectRecords(item, fields);
  }
  return mapped;
}

function pickFields(
  item: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in item) {
      picked[key] = projectRecords(item[key], fields);
    }
  }
  return picked;
}

export interface RecordDigest {
  path: string;
  records: number;
  preview: unknown[];
}

export function digestRecords(
  value: unknown,
  limit: number,
  fields: readonly string[] | null,
): RecordDigest | null {
  const found = firstRecordArray(value);
  if (found === null) {
    return null;
  }
  const preview = found.items
    .slice(0, limit)
    .map((item) => (fields === null || !isPlainObject(item) ? item : pickFields(item, fields)));
  return { path: found.path, records: found.items.length, preview };
}

interface RecordArray {
  path: string;
  items: unknown[];
}

function firstRecordArray(value: unknown): RecordArray | null {
  const root = asRecordArray(value, '$');
  if (root !== null) {
    return root;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const queue: Array<{ node: Record<string, unknown>; prefix: string }> = [
    { node: value, prefix: '' },
  ];
  while (queue.length > 0) {
    const current = queue.shift() as { node: Record<string, unknown>; prefix: string };
    for (const [key, item] of Object.entries(current.node)) {
      const path = current.prefix.length === 0 ? key : `${current.prefix}.${key}`;
      const found = asRecordArray(item, path);
      if (found !== null) {
        return found;
      }
      if (isPlainObject(item)) {
        queue.push({ node: item, prefix: path });
      }
    }
  }
  return null;
}

function asRecordArray(value: unknown, path: string): RecordArray | null {
  if (Array.isArray(value) && value.some(isPlainObject)) {
    return { path, items: value };
  }
  return null;
}

export async function saveBodyToFile(
  ctx: ShapingContext,
  operationId: string,
  rawBody: string,
): Promise<string> {
  if (ctx.meta.threadId === undefined || ctx.meta.threadId.length === 0) {
    throw new AddonError('invalid_params', {
      detail: 'saveToFile works only inside a thread session; retry without saveToFile',
    });
  }
  const dir = await ctx.files.locate({ scope: 'thread' });
  const name = `${dir.path}/tool-outputs/${safeSegment(operationId)}-${Date.now()}.json`;
  const bytes = Buffer.from(rawBody, 'utf8');
  let written: { path: string; size: number } | null = null;
  for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
    written = await ctx.files.write({
      path: name,
      data: bytes.subarray(offset, offset + WRITE_CHUNK_BYTES).toString('base64'),
      append: offset > 0,
    });
  }
  if (written === null) {
    throw new AddonError('invalid_params', { detail: 'response body is empty; nothing to save' });
  }
  return written.path;
}

export interface InlineBody {
  json?: unknown;
  text: string | null;
}

export function inlineProjectedBody(json: unknown, maxBytes: number): InlineBody {
  const serialized = JSON.stringify(json);
  if (new TextEncoder().encode(serialized).length <= maxBytes) {
    return { json, text: null };
  }
  return { text: truncateText(serialized, maxBytes) };
}

export function safeSegment(value: string): string {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length === 0 ? 'operation' : cleaned.slice(0, 64);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function shapeResponse(
  ctx: ShapingContext,
  operationId: string,
  response: HttpResponse,
  shape: ResponseShape | null,
  maxBytes: number,
): Promise<unknown> {
  const base = {
    status: response.status,
    contentType: contentTypeOf(response) ?? null,
    responseHeaders: selectHeaders(response.headers),
  };
  if (shape === null) {
    return { ...base, ...bodyPart(response.body, response, maxBytes) };
  }
  const raw = response.body ?? '';
  const parsed = parseJsonBody(response.body);
  if (shape.saveToFile) {
    return saveToFileDigest({ ctx, operationId, base, raw, parsed, shape });
  }
  if (shape.fields !== null && parsed !== undefined) {
    const inlined = inlineProjectedBody(projectRecords(parsed, shape.fields), maxBytes);
    return {
      ...base,
      ...(inlined.json !== undefined ? { body: inlined.json } : { body: inlined.text }),
    };
  }
  const note = shape.fields !== null ? { note: 'fields ignored: response body is not JSON' } : {};
  return { ...base, ...bodyPart(response.body, response, maxBytes), ...note };
}

interface SavedDigestInput {
  ctx: ShapingContext;
  operationId: string;
  base: Record<string, unknown>;
  raw: string;
  parsed: unknown;
  shape: ResponseShape;
}

async function saveToFileDigest({
  ctx,
  operationId,
  base,
  raw,
  parsed,
  shape,
}: SavedDigestInput): Promise<unknown> {
  const savedTo = raw.length > 0 ? await saveBodyToFile(ctx, operationId, raw) : null;
  const digest =
    parsed === undefined ? null : digestRecords(parsed, shape.previewLimit, shape.fields);
  const counters =
    digest === null
      ? {}
      : { records: digest.records, recordsAt: digest.path, preview: digest.preview };
  const note = savedBodyNote(savedTo, parsed, digest);
  return { ...base, savedTo, bytes: byteLength(raw), ...counters, ...note };
}

function savedBodyNote(
  savedTo: string | null,
  parsed: unknown,
  digest: RecordDigest | null,
): { note?: string } {
  if (savedTo === null) {
    return { note: 'response body is empty; no file was written' };
  }
  if (digest !== null) {
    return {};
  }
  return parsed === undefined
    ? { note: 'response body is not JSON; it was saved raw, preview omitted' }
    : { note: 'no arrays of records in the body; read the saved file' };
}

function bodyPart(
  body: string | null,
  response: HttpResponse,
  maxBytes: number,
): Record<string, unknown> {
  const payload = responsePayload(body, contentTypeOf(response), maxBytes);
  return payload.json !== undefined ? { body: payload.json } : { body: payload.text };
}

function contentTypeOf(response: { headers: Record<string, string> }): string | undefined {
  return response.headers['content-type'] ?? response.headers['Content-Type'];
}

function selectHeaders(headers: Record<string, string>): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === 'content-type' ||
      lower.startsWith('x-request-id') ||
      lower.startsWith('x-ratelimit') ||
      lower === 'retry-after'
    ) {
      selected[key] = value;
    }
  }
  return selected;
}
