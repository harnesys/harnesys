import {
  type AgentPresetBody,
  AgentPresetBodySchema,
  type PresetKind,
  PresetKindSchema,
  PresetOriginSchema,
  type TeamPresetBody,
  TeamPresetBodySchema,
} from '@harnesys/contracts';
import { PresetValidationException } from '../../domain/presets/preset.error.ts';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';
import { type PresetRow } from './presets.schema.ts';

export function toPresetRecord(row: PresetRow): PresetRecord {
  const kind = PresetKindSchema.safeParse(row.kind);
  if (!kind.success) {
    throw new PresetValidationException(`unknown preset kind: ${row.kind}`, kind.error.issues);
  }
  const origin = PresetOriginSchema.safeParse(row.origin);
  if (!origin.success) {
    throw new PresetValidationException(
      `unknown preset origin: ${row.origin}`,
      origin.error.issues,
    );
  }
  return {
    id: row.id,
    kind: kind.data,
    origin: origin.data,
    version: row.version,
    name: row.name,
    description: row.description,
    body: parsePresetBody(kind.data, row.body),
    author: row.author,
    installedFrom: row.installedFrom,
    tags: parsePresetTags(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPresetRow(record: PresetRecord): PresetRow {
  return {
    id: record.id,
    kind: record.kind,
    origin: record.origin,
    version: record.version,
    name: record.name,
    description: record.description,
    body: JSON.stringify(record.body),
    author: record.author,
    installedFrom: record.installedFrom,
    tags: JSON.stringify(record.tags),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function parsePresetBody(kind: PresetKind, raw: string): AgentPresetBody | TeamPresetBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PresetValidationException(
      `invalid preset body JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result =
    kind === 'team'
      ? TeamPresetBodySchema.safeParse(parsed)
      : AgentPresetBodySchema.safeParse(parsed);
  if (!result.success) {
    throw new PresetValidationException('invalid preset body', result.error.issues);
  }
  return result.data;
}

export function parsePresetTags(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PresetValidationException(
      `invalid preset tags JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== 'string')) {
    throw new PresetValidationException('invalid preset tags', parsed);
  }
  return parsed as string[];
}
