import type { z } from 'zod';

export type CatalogMethod = 'GET' | 'POST';

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  method: CatalogMethod;
  /** Org API path template; `:orgId` is substituted by the caller. */
  path: string;
  /** Query schema; the inspector form and the binding picker read its fields. */
  query?: z.ZodType;
  /** Response schema; field suggestions are walked from its JSON Schema. */
  response: z.ZodType;
  /** `events/watch` topics that make a cached response of this entry stale. */
  invalidatedBy: string[];
}

/** Identity helper that keeps the literal `id` and the schema types. */
export function defineCatalogEntry<const E extends CatalogEntry>(entry: E): E {
  return entry;
}
