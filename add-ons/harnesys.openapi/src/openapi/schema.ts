const MAX_DEPTH = 8;
const MAX_ENUM_VALUES = 20;
const MAX_BRANCHES = 8;
const MAX_REQUIRED = 50;

const KEPT_KEYS = [
  'description',
  'default',
  'enum',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
] as const;

export type SchemaResolve = (ref: string) => unknown;

export function convertSchema(
  raw: unknown,
  resolve: SchemaResolve,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > MAX_DEPTH) {
    return { description: 'schema omitted: depth limit' };
  }
  if (raw === null || raw === undefined || raw === false) {
    return null;
  }
  if (raw === true) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref === 'string' && ref.length > 0) {
    return convertRef(record, ref, resolve, depth);
  }
  if (Array.isArray(record.allOf)) {
    return mergeAllOf(record.allOf, record, resolve, depth);
  }
  return convertObjectSchema(record, resolve, depth);
}

function convertRef(
  record: Record<string, unknown>,
  ref: string,
  resolve: SchemaResolve,
  depth: number,
): Record<string, unknown> | null {
  if (!ref.startsWith('#')) {
    return { description: `external $ref '${ref}' not inlined` };
  }
  const target = resolve(ref);
  if (target === null || target === undefined || target === record) {
    return { description: 'recursive or unresolvable $ref' };
  }
  const converted = convertSchema(target, resolve, depth + 1);
  if (converted === null) {
    return null;
  }
  const description = typeof record.description === 'string' ? record.description : undefined;
  return description === undefined ? converted : { ...converted, description };
}

function convertObjectSchema(
  raw: Record<string, unknown>,
  resolve: SchemaResolve,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  collectScalarConstraints(raw, out);
  collectStructure(raw, resolve, depth, out);
  collectBranches(raw, resolve, depth, out);
  return out;
}

function collectScalarConstraints(
  raw: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  const type = firstType(raw.type);
  if (type !== undefined) {
    out.type = type;
  }
  for (const key of KEPT_KEYS) {
    const value = raw[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'enum' && Array.isArray(value)) {
      out[key] = value.slice(0, MAX_ENUM_VALUES);
      continue;
    }
    out[key] = value;
  }
  if (typeof raw.format === 'string') {
    out.format = raw.format;
  }
  if (Array.isArray(raw.required)) {
    out.required = raw.required.filter((entry) => typeof entry === 'string').slice(0, MAX_REQUIRED);
  }
}

function collectStructure(
  raw: Record<string, unknown>,
  resolve: SchemaResolve,
  depth: number,
  out: Record<string, unknown>,
): void {
  const properties = recordOf(raw.properties);
  if (properties !== null) {
    const converted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(properties)) {
      const childSchema = convertSchema(child, resolve, depth + 1);
      if (childSchema !== null) {
        converted[key] = childSchema;
      }
    }
    if (Object.keys(converted).length > 0) {
      out.properties = converted;
    }
  }
  if (raw.items !== undefined) {
    const items = convertSchema(raw.items, resolve, depth + 1);
    if (items !== null) {
      out.items = items;
    }
  }
  collectAdditionalProperties(raw, resolve, depth, out);
}

function collectAdditionalProperties(
  raw: Record<string, unknown>,
  resolve: SchemaResolve,
  depth: number,
  out: Record<string, unknown>,
): void {
  if (typeof raw.additionalProperties === 'boolean') {
    out.additionalProperties = raw.additionalProperties;
    return;
  }
  if (recordOf(raw.additionalProperties) !== null) {
    const converted = convertSchema(raw.additionalProperties, resolve, depth + 1);
    if (converted !== null) {
      out.additionalProperties = converted;
    }
  }
}

function collectBranches(
  raw: Record<string, unknown>,
  resolve: SchemaResolve,
  depth: number,
  out: Record<string, unknown>,
): void {
  const branchKey = branchKeyOf(raw);
  if (branchKey === undefined) {
    return;
  }
  const branches = convertBranches(raw[branchKey], resolve, depth);
  if (branches !== null) {
    out[branchKey] = branches;
  }
}

function firstType(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const strings = value.filter((entry): entry is string => typeof entry === 'string');
    const nonNull = strings.find((entry) => entry !== 'null');
    return nonNull ?? (strings.length > 0 ? 'null' : undefined);
  }
  return undefined;
}

function branchKeyOf(record: Record<string, unknown>): 'anyOf' | 'oneOf' | undefined {
  if (Array.isArray(record.oneOf)) {
    return 'oneOf';
  }
  if (Array.isArray(record.anyOf)) {
    return 'anyOf';
  }
  return undefined;
}

function convertBranches(
  list: unknown,
  resolve: SchemaResolve,
  depth: number,
): Record<string, unknown>[] | null {
  if (!Array.isArray(list)) {
    return null;
  }
  const converted: Record<string, unknown>[] = [];
  for (const branch of list.slice(0, MAX_BRANCHES)) {
    const schema = convertSchema(branch, resolve, depth + 1);
    if (schema !== null) {
      converted.push(schema);
    }
  }
  return converted.length > 0 ? converted : null;
}

function mergeAllOf(
  members: unknown[],
  record: Record<string, unknown>,
  resolve: SchemaResolve,
  depth: number,
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};
  const descriptions: string[] = [];
  for (const member of members.slice(0, MAX_BRANCHES)) {
    const schema = convertSchema(member, resolve, depth + 1);
    if (schema === null) {
      continue;
    }
    if (typeof schema.description === 'string') {
      descriptions.push(schema.description);
      delete schema.description;
    }
    Object.assign(merged, schema);
  }
  if (typeof record.description === 'string') {
    descriptions.unshift(record.description);
  }
  if (descriptions.length > 0) {
    merged.description = descriptions.join('. ');
  }
  return Object.keys(merged).length > 0 ? merged : {};
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
