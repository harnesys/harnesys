import type { JsonValue } from '@harnesys/contracts';
import { primitiveById } from '@harnesys/contracts';
import { z } from 'zod';

const CONTROL_NAMES = [
  'text',
  'textarea',
  'number',
  'switch',
  'select',
  'color',
  'list',
  'record',
  'json',
] as const;

export type PropControl = (typeof CONTROL_NAMES)[number];

export type PropValueKind = 'string' | 'number' | 'boolean' | 'json';

export interface PropFieldSpec {
  key: string;
  label: string;
  hint?: string;
  control: PropControl;
  options?: string[];
  valueKind: PropValueKind;
  /** Schema requires the value and declares no default. */
  required: boolean;
  defaultValue?: JsonValue;
  /** Row fields when `control === 'list'` and rows are objects. */
  fields?: PropFieldSpec[];
  /** Element kind when `control === 'list'` and rows are scalars. */
  element?: PropValueKind;
}

interface SchemaNode {
  type?: string | string[];
  anyOf?: unknown[];
  label?: string;
  hint?: string;
  control?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  additionalProperties?: unknown;
  $ref?: string;
  $defs?: Record<string, unknown>;
}

const EMPTY = {};

function asRecord(value: unknown): SchemaNode | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as SchemaNode;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isControl(value: string): value is PropControl {
  return (CONTROL_NAMES as readonly string[]).includes(value);
}

function deref(node: SchemaNode, root: SchemaNode): SchemaNode {
  const ref = node.$ref;
  if (ref === undefined) {
    return node;
  }
  const defs = root.$defs;
  const name = ref.replace('#/$defs/', '');
  const target = defs === undefined ? undefined : asRecord(defs[name]);
  return target ?? node;
}

/** A nullable schema is an `anyOf` of the real type and `null`; forms edit the real type. */
function baseNode(node: SchemaNode, root: SchemaNode): SchemaNode {
  if (!Array.isArray(node.anyOf)) {
    return deref(node, root);
  }
  const candidates = node.anyOf
    .map(asRecord)
    .filter((entry): entry is SchemaNode => entry !== undefined)
    .filter((entry) => entry.type !== 'null');
  const [single] = candidates;
  return candidates.length === 1 && single !== undefined ? deref(single, root) : deref(node, root);
}

function singleType(node: SchemaNode): string | undefined {
  if (typeof node.type === 'string') {
    return node.type;
  }
  if (Array.isArray(node.type)) {
    const types = node.type.filter((entry) => entry !== 'null');
    return types.length === 1 ? types[0] : undefined;
  }
  return undefined;
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value as JsonValue;
  }
  return undefined;
}

function valueKindOf(type: string | undefined): PropValueKind {
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  if (type === 'array' || type === 'object') {
    return 'json';
  }
  return 'string';
}

function valueKindFor(control: PropControl, type: string | undefined): PropValueKind {
  if (control === 'number') {
    return 'number';
  }
  if (control === 'switch') {
    return 'boolean';
  }
  if (control === 'list' || control === 'record' || control === 'json') {
    return 'json';
  }
  return valueKindOf(type);
}

function derivedControl(
  node: SchemaNode,
  root: SchemaNode,
  options: string[] | undefined,
): PropControl {
  if (options !== undefined) {
    return 'select';
  }
  const type = singleType(node);
  if (type === 'boolean') {
    return 'switch';
  }
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  if (type === 'array') {
    const items = deref(asRecord(node.items) ?? EMPTY, root);
    if (items.type === 'object' && items.properties === undefined) {
      return 'json';
    }
    if (items.type === 'array') {
      return 'json';
    }
    return 'list';
  }
  if (type === 'object') {
    const extra = node.additionalProperties;
    return extra !== undefined && asRecord(extra) !== undefined ? 'record' : 'json';
  }
  return 'text';
}

function stringOptions(node: SchemaNode, root: SchemaNode): string[] | undefined {
  const base = baseNode(node, root);
  if (!Array.isArray(base.enum)) {
    return undefined;
  }
  const options = base.enum.filter((entry): entry is string => typeof entry === 'string');
  return options.length > 0 ? options : undefined;
}

function rowFields(node: SchemaNode, root: SchemaNode): PropFieldSpec[] | undefined {
  const items = deref(asRecord(node.items) ?? EMPTY, root);
  const properties = items.properties;
  if (properties === undefined) {
    return undefined;
  }
  const required = new Set(items.required ?? []);
  return Object.entries(properties).map(([key, raw]) =>
    describeField(key, deref(asRecord(raw) ?? EMPTY, root), required.has(key), root),
  );
}

function describeField(
  key: string,
  node: SchemaNode,
  requiredBySchema: boolean,
  root: SchemaNode,
): PropFieldSpec {
  const base = baseNode(node, root);
  const options = stringOptions(node, root);
  const declared = asString(node.control);
  const control =
    declared !== undefined && isControl(declared) ? declared : derivedControl(base, root, options);
  const defaultValue = jsonValue(node.default);
  const spec: PropFieldSpec = {
    key,
    label: asString(node.label) ?? key,
    control,
    valueKind: valueKindFor(control, singleType(base)),
    required: requiredBySchema && node.default === undefined,
  };
  const hint = asString(node.hint);
  if (hint !== undefined) {
    spec.hint = hint;
  }
  if (options !== undefined) {
    spec.options = options;
  }
  if (defaultValue !== undefined) {
    spec.defaultValue = defaultValue;
  }
  if (control === 'list') {
    const fields = rowFields(base, root);
    if (fields !== undefined) {
      spec.fields = fields;
    } else {
      const items = deref(asRecord(base.items) ?? EMPTY, root);
      spec.element = valueKindOf(singleType(items));
    }
  }
  return spec;
}

/**
 * Inspector fields derived from a JSON Schema plus its `.meta()` annotations
 * (label, hint, control), so a new descriptor field appears without webui edits.
 */
export function schemaFieldSpecs(schema: unknown): PropFieldSpec[] {
  const root = asRecord(schema);
  const properties = root?.properties;
  if (!root || properties === undefined) {
    return [];
  }
  const required = new Set(root.required ?? []);
  return Object.entries(properties).map(([key, raw]) =>
    describeField(key, deref(asRecord(raw) ?? EMPTY, root), required.has(key), root),
  );
}

export function propFieldSpecs(primitive: string): PropFieldSpec[] {
  const descriptor = primitiveById(primitive);
  if (!descriptor) {
    return [];
  }
  return schemaFieldSpecs(z.toJSONSchema(descriptor.props));
}
