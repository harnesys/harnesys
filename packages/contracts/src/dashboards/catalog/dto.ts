import { z } from 'zod';
import type { CatalogEntry, CatalogMethod } from './define.ts';
import { CATALOG_ENTRIES } from './registry.ts';

export interface DashboardCatalogEntryDto {
  id: string;
  label: string;
  description: string;
  method: CatalogMethod;
  path: string;
  querySchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown>;
  invalidatedBy: string[];
}

export interface DashboardsCatalogResponse {
  items: DashboardCatalogEntryDto[];
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input' });
}

export function toCatalogEntryDto(entry: CatalogEntry): DashboardCatalogEntryDto {
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    method: entry.method,
    path: entry.path,
    querySchema: entry.query ? jsonSchemaOf(entry.query) : null,
    responseSchema: jsonSchemaOf(entry.response),
    invalidatedBy: entry.invalidatedBy,
  };
}

let entriesDto: DashboardCatalogEntryDto[] | undefined;

/** Catalog with JSON Schemas, built once per process for the UI and agent tools. */
export function dashboardCatalogResponse(): DashboardsCatalogResponse {
  entriesDto ??= CATALOG_ENTRIES.map(toCatalogEntryDto);
  return { items: entriesDto };
}
