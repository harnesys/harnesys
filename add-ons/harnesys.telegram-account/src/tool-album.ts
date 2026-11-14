import { AddonError } from '@harnesys/sdk';
import type { RequestedMediaKind } from './media-kind.ts';
import { requestedKindOf } from './media-kind.ts';

export const MAX_ALBUM_ITEMS = 10;
export const MIN_ALBUM_ITEMS = 2;
export const MAX_CAPTION = 1024;

export interface MediaItemInput {
  source: string;
  kind: RequestedMediaKind;
  caption?: string;
}

function captionOf(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  if (value.length > MAX_CAPTION) {
    throw new AddonError('invalid_params', { detail: `${key} exceeds ${MAX_CAPTION} characters` });
  }
  return value;
}

function itemOf(value: unknown, index: number): MediaItemInput {
  if (typeof value !== 'object' || value === null) {
    throw new AddonError('invalid_params', { detail: `items[${index}] must be an object` });
  }
  const record = value as Record<string, unknown>;
  if (typeof record.source !== 'string' || record.source.trim().length === 0) {
    throw new AddonError('invalid_params', { detail: `items[${index}].source is required` });
  }
  const kind = record.kind === undefined ? 'auto' : requestedKindOf(record.kind);
  const caption = captionOf(record.caption, `items[${index}].caption`);
  return { source: record.source.trim(), kind, caption };
}

export function albumItemsOf(input: Record<string, unknown>, key: string): MediaItemInput[] {
  const raw = input[key];
  if (!Array.isArray(raw)) {
    throw new AddonError('invalid_params', { detail: `${key} must be an array of media items` });
  }
  if (raw.length < MIN_ALBUM_ITEMS || raw.length > MAX_ALBUM_ITEMS) {
    throw new AddonError('invalid_params', {
      detail: `${key} needs ${MIN_ALBUM_ITEMS} to ${MAX_ALBUM_ITEMS} items, got ${raw.length}`,
    });
  }
  return raw.map((entry, index) => itemOf(entry, index));
}

export function mediaItemOf(input: Record<string, unknown>): MediaItemInput {
  if (typeof input.source !== 'string' || input.source.trim().length === 0) {
    throw new AddonError('invalid_params', { detail: 'source is required' });
  }
  const kind = input.kind === undefined ? 'auto' : requestedKindOf(input.kind);
  return { source: input.source.trim(), kind, caption: captionOf(input.caption, 'caption') };
}