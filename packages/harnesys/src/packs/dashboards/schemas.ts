import {
  primitiveById,
  WidgetDocSchema,
  WidgetRectSchema,
  WidgetSourceSchema,
} from '@harnesys/contracts';
import { z } from 'zod';
import type { JsonSchema } from '../../domain/json-schema.ts';

const SCHEMA_ID_BASE = 'urn:harnesys:contracts:dashboards';

/**
 * Zod's JSON Schema output is wider than the pack's `JsonSchema` (boolean
 * subschemas, `$defs` references). The single cast lives here; every schema
 * below is generated from `@harnesys/contracts`, never retyped by hand.
 *
 * `$id` is required: `z.toJSONSchema` keeps recursive expressions in `$defs`
 * behind `#/$defs/...` refs, and those refs must resolve against this schema
 * rather than the root of the tool input object it is nested in.
 */
function packSchema(schema: z.ZodType, id: string, description: string): JsonSchema {
  const json = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
  return { ...json, $id: `${SCHEMA_ID_BASE}:${id}`, description };
}

export const RECT_SCHEMA = packSchema(
  WidgetRectSchema,
  'widget-rect',
  'Pixel box on the 8 px grid: x, y, w, h in CSS pixels.',
);

export const SOURCE_SCHEMA = packSchema(
  WidgetSourceSchema,
  'widget-source',
  'Data source: orgApi (path starts with /orgs/<orgId>) or external (url/headers/secretRefs; header values reference vault entries as {{vault:name}} — never inline secrets). query and body values are Expr literals here.',
);

export const DOC_SCHEMA = packSchema(
  WidgetDocSchema,
  'widget-doc',
  'Widget document (WidgetDoc contract, schemaVersion 1). Composite form: `items` on an internal subgrid sharing one reactive scope (`state`, `sources`, `derived`); item `props` hold static data, `bindings` carry data in, `on` carries events out. A doc without items is a legacy single-primitive widget (`primitive` + `config`, optional `transform`).',
);

export function primitivePropsSchema(id: string): JsonSchema | undefined {
  const descriptor = primitiveById(id);
  if (descriptor === undefined) {
    return undefined;
  }
  return packSchema(descriptor.props, `primitive:${id}:props`, descriptor.description);
}
