import { z } from 'zod';

export type JsonSchemaItems = JsonSchemaSubset | JsonSchemaSubset[];

export interface JsonSchemaSubset {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchemaSubset>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaSubset;
  items?: JsonSchemaItems;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  oneOf?: JsonSchemaSubset[];
  anyOf?: JsonSchemaSubset[];
  description?: string;
  default?: unknown;
  $defs?: Record<string, JsonSchemaSubset>;
  $ref?: string;
}

const node = z.lazy(
  (): z.ZodType<JsonSchemaSubset> =>
    z.strictObject({
      type: z
        .enum(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
        .optional(),
      properties: z.record(z.string(), node).optional(),
      required: z.array(z.string()).optional(),
      additionalProperties: z.union([z.boolean(), node]).optional(),
      items: z.union([node, z.array(node)]).optional(),
      enum: z.array(z.unknown()).optional(),
      const: z.unknown().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      pattern: z.string().optional(),
      minItems: z.number().int().nonnegative().optional(),
      maxItems: z.number().int().nonnegative().optional(),
      uniqueItems: z.boolean().optional(),
      oneOf: z.array(node).optional(),
      anyOf: z.array(node).optional(),
      description: z.string().optional(),
      default: z.unknown().optional(),
      $defs: z.record(z.string(), node).optional(),
      $ref: z.string().optional(),
    }),
);

export const JsonSchemaSubsetSchema = node;

export const INPUT_SCHEMA_MAX_DEPTH = 8;
export const INPUT_SCHEMA_MAX_BYTES = 64 * 1024;

export interface SchemaViolation {
  path: string;
  code: 'schema' | 'depth' | 'size' | 'external_ref';
  message: string;
}

export function validateInputSchema(raw: unknown): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const parsed = JsonSchemaSubsetSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      violations.push({
        path: issue.path.map(String).join('.') || '(root)',
        code: 'schema',
        message: issue.message,
      });
    }
    return violations;
  }
  const size = new TextEncoder().encode(JSON.stringify(raw)).length;
  if (size > INPUT_SCHEMA_MAX_BYTES) {
    violations.push({
      path: '(root)',
      code: 'size',
      message: `schema exceeds ${INPUT_SCHEMA_MAX_BYTES} bytes (${size})`,
    });
  }
  checkNode(parsed.data, '$', 0, violations);
  return violations;
}

const LOCAL_REF = /^#(\/(\$defs|properties)\/[A-Za-z0-9_-]+)*$/;

function checkNode(
  nodeValue: JsonSchemaSubset,
  path: string,
  depth: number,
  violations: SchemaViolation[],
): void {
  if (depth > INPUT_SCHEMA_MAX_DEPTH) {
    violations.push({
      path,
      code: 'depth',
      message: `schema depth exceeds ${INPUT_SCHEMA_MAX_DEPTH}`,
    });
    return;
  }
  checkRef(nodeValue, path, violations);
  checkChildren(nodeValue, path, depth, violations);
}

function checkRef(nodeValue: JsonSchemaSubset, path: string, violations: SchemaViolation[]): void {
  if (nodeValue.$ref !== undefined && !LOCAL_REF.test(nodeValue.$ref)) {
    violations.push({
      path,
      code: 'external_ref',
      message: `external $ref '${nodeValue.$ref}' is not allowed`,
    });
  }
}

function checkChildren(
  nodeValue: JsonSchemaSubset,
  path: string,
  depth: number,
  violations: SchemaViolation[],
): void {
  for (const child of Object.values(nodeValue.properties ?? {})) {
    checkNode(child, `${path}.properties`, depth + 1, violations);
  }
  checkItems(nodeValue.items, path, depth, violations);
  const branches = [...(nodeValue.oneOf ?? []), ...(nodeValue.anyOf ?? [])];
  for (const branch of branches) {
    checkNode(branch, `${path}.oneOf`, depth + 1, violations);
  }
  if (typeof nodeValue.additionalProperties === 'object') {
    checkNode(
      nodeValue.additionalProperties,
      `${path}.additionalProperties`,
      depth + 1,
      violations,
    );
  }
  for (const def of Object.values(nodeValue.$defs ?? {})) {
    checkNode(def, `${path}.$defs`, depth + 1, violations);
  }
}

function checkItems(
  items: JsonSchemaItems | undefined,
  path: string,
  depth: number,
  violations: SchemaViolation[],
): void {
  if (!items) {
    return;
  }
  for (const item of Array.isArray(items) ? items : [items]) {
    checkNode(item, `${path}.items`, depth + 1, violations);
  }
}
