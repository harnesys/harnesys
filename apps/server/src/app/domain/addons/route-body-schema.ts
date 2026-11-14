import type { JsonSchemaSubset } from '@harnesys/sdk';

export interface RouteSchemaIssue {
  path: string;
  message: string;
}

interface ValidationContext {
  root: Record<string, unknown>;
  issues: RouteSchemaIssue[];
}

const MAX_VALIDATION_DEPTH = 16;

/**
 * Validates a request body against a route `requestSchema` (§6.5 JSON Schema
 * subset: type, properties, required, items, enum, const, numeric and string
 * bounds, additionalProperties, limited oneOf/anyOf, local $defs).
 */
export function routeSchemaIssues(
  value: unknown,
  schema: Record<string, unknown>,
): RouteSchemaIssue[] {
  const ctx: ValidationContext = { root: schema, issues: [] };
  validateNode(value, schema, '$', 0, ctx);
  return ctx.issues;
}

function validateNode(
  value: unknown,
  node: JsonSchemaSubset,
  path: string,
  depth: number,
  ctx: ValidationContext,
): void {
  if (depth > MAX_VALIDATION_DEPTH) {
    ctx.issues.push({ path, message: 'value nesting exceeds the maximum depth' });
    return;
  }
  if (node.$ref !== undefined) {
    validateRef(value, node.$ref, path, depth, ctx);
    return;
  }
  if (!matchesUnion(value, node, path, ctx)) {
    return;
  }
  if (!matchesEnum(value, node, path, ctx)) {
    return;
  }
  if (node.const !== undefined && node.const !== value) {
    ctx.issues.push({ path, message: 'value does not equal the const constraint' });
    return;
  }
  if (typeof value === 'string') {
    validateString(value, node, path, ctx);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    validateNumber(value, node, path, ctx);
  } else if (Array.isArray(value)) {
    validateArray(value, node, path, depth, ctx);
  } else if (isPlainObject(value)) {
    validateObject(value, node, path, depth, ctx);
  }
}

function validateRef(
  value: unknown,
  ref: string,
  path: string,
  depth: number,
  ctx: ValidationContext,
): void {
  const resolved = resolveRef(ctx.root, ref);
  if (resolved === null) {
    ctx.issues.push({ path, message: `unresolvable $ref '${ref}'` });
    return;
  }
  validateNode(value, resolved, path, depth + 1, ctx);
}

function matchesUnion(
  value: unknown,
  node: JsonSchemaSubset,
  path: string,
  ctx: ValidationContext,
): boolean {
  if (node.oneOf !== undefined && node.oneOf.length > 0) {
    const matches = node.oneOf.filter((branch) => branchIssues(value, branch, ctx) === 0).length;
    if (matches !== 1) {
      ctx.issues.push({ path, message: `expected exactly one oneOf branch, matched ${matches}` });
      return false;
    }
    return true;
  }
  if (node.anyOf !== undefined && node.anyOf.length > 0) {
    if (!node.anyOf.some((branch) => branchIssues(value, branch, ctx) === 0)) {
      ctx.issues.push({ path, message: 'value matches no anyOf branch' });
      return false;
    }
    return true;
  }
  if (!matchesType(value, node.type)) {
    ctx.issues.push({ path, message: `expected ${node.type ?? 'any'}, got ${kindOf(value)}` });
    return false;
  }
  return true;
}

function matchesEnum(
  value: unknown,
  node: JsonSchemaSubset,
  path: string,
  ctx: ValidationContext,
): boolean {
  if (node.enum === undefined || node.enum.some((entry) => entry === value)) {
    return true;
  }
  ctx.issues.push({ path, message: 'value is not one of the allowed enum entries' });
  return false;
}

type SchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

function matchesType(value: unknown, expected: SchemaType | undefined): boolean {
  if (expected === undefined) {
    return true;
  }
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    default:
      return true;
  }
}

function validateString(
  value: string,
  node: JsonSchemaSubset,
  path: string,
  ctx: ValidationContext,
): void {
  if (node.minLength !== undefined && value.length < node.minLength) {
    ctx.issues.push({ path, message: `length is below minLength ${node.minLength}` });
  }
  if (node.maxLength !== undefined && value.length > node.maxLength) {
    ctx.issues.push({ path, message: `length exceeds maxLength ${node.maxLength}` });
  }
  if (node.pattern === undefined) {
    return;
  }
  try {
    if (!new RegExp(node.pattern).test(value)) {
      ctx.issues.push({ path, message: `value does not match pattern '${node.pattern}'` });
    }
  } catch {
    ctx.issues.push({ path, message: `schema pattern '${node.pattern}' is not a valid regex` });
  }
}

function validateNumber(
  value: number,
  node: JsonSchemaSubset,
  path: string,
  ctx: ValidationContext,
): void {
  if (node.minimum !== undefined && value < node.minimum) {
    ctx.issues.push({ path, message: `value is below minimum ${node.minimum}` });
  }
  if (node.maximum !== undefined && value > node.maximum) {
    ctx.issues.push({ path, message: `value exceeds maximum ${node.maximum}` });
  }
  if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
    ctx.issues.push({
      path,
      message: `value is not above exclusiveMinimum ${node.exclusiveMinimum}`,
    });
  }
  if (node.exclusiveMaximum !== undefined && value >= node.exclusiveMaximum) {
    ctx.issues.push({
      path,
      message: `value is not below exclusiveMaximum ${node.exclusiveMaximum}`,
    });
  }
}

function validateArray(
  value: unknown[],
  node: JsonSchemaSubset,
  path: string,
  depth: number,
  ctx: ValidationContext,
): void {
  if (node.minItems !== undefined && value.length < node.minItems) {
    ctx.issues.push({ path, message: `array has fewer than minItems ${node.minItems}` });
  }
  if (node.maxItems !== undefined && value.length > node.maxItems) {
    ctx.issues.push({ path, message: `array has more than maxItems ${node.maxItems}` });
  }
  if (node.uniqueItems === true && hasDuplicates(value)) {
    ctx.issues.push({ path, message: 'array entries are not unique' });
  }
  if (node.items === undefined) {
    return;
  }
  const items = node.items;
  if (Array.isArray(items)) {
    for (const [index, item] of value.entries()) {
      const itemSchema = items[index];
      if (itemSchema !== undefined) {
        validateNode(item, itemSchema, `${path}[${index}]`, depth + 1, ctx);
      }
    }
    return;
  }
  for (const [index, item] of value.entries()) {
    validateNode(item, items, `${path}[${index}]`, depth + 1, ctx);
  }
}

function validateObject(
  value: Record<string, unknown>,
  node: JsonSchemaSubset,
  path: string,
  depth: number,
  ctx: ValidationContext,
): void {
  for (const key of node.required ?? []) {
    if (!(key in value)) {
      ctx.issues.push({ path, message: `missing required property '${key}'` });
    }
  }
  const additional = node.additionalProperties;
  if (additional === undefined || additional === true) {
    validateDeclaredProperties(value, node, path, depth, ctx);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    const declared = node.properties?.[key];
    if (declared !== undefined) {
      validateNode(child, declared, childPath, depth + 1, ctx);
      continue;
    }
    if (additional === false) {
      ctx.issues.push({ path: childPath, message: 'property is not allowed by the schema' });
      continue;
    }
    validateNode(child, additional, childPath, depth + 1, ctx);
  }
}

function validateDeclaredProperties(
  value: Record<string, unknown>,
  node: JsonSchemaSubset,
  path: string,
  depth: number,
  ctx: ValidationContext,
): void {
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (key in value) {
      validateNode(value[key], child, `${path}.${key}`, depth + 1, ctx);
    }
  }
}

function branchIssues(value: unknown, branch: JsonSchemaSubset, ctx: ValidationContext): number {
  const issues: RouteSchemaIssue[] = [];
  validateNode(value, branch, '$', 0, { root: ctx.root, issues });
  return issues.length;
}

function resolveRef(root: Record<string, unknown>, ref: string): JsonSchemaSubset | null {
  if (!ref.startsWith('#/')) {
    return null;
  }
  let current: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    if (!isPlainObject(current)) {
      return null;
    }
    current = current[segment];
  }
  return isPlainObject(current) ? (current as JsonSchemaSubset) : null;
}

function hasDuplicates(value: unknown[]): boolean {
  const seen = new Set<string>();
  for (const entry of value) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}
