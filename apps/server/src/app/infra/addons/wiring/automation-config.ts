import { defaultConfigValues, type FieldSpec, type TriggerDescriptor } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';

export function mergeTriggerConfig(
  descriptor: TriggerDescriptor,
  current: Record<string, unknown>,
  provided: Record<string, unknown>,
): Record<string, unknown> {
  const flat = flattenConfig(descriptor.configFields, provided);
  const config = {
    ...defaultConfigValues(descriptor.configFields),
    ...flattenConfig(descriptor.configFields, current).values,
    ...flat.values,
  };
  const issues = configIssues(descriptor.configFields, config, flat.groups);
  if (issues.length > 0) {
    throw new AddonException('invalid_params', 422, `config rejected: ${issues.join('; ')}`);
  }
  return config;
}

export function normalizeTargetScripts(target: Record<string, unknown>): Record<string, unknown> {
  const scripts = target.scripts;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return target;
  }
  if ('pre' in scripts || 'post' in scripts) {
    return target;
  }
  const rest: Record<string, unknown> = { ...target };
  delete rest.scripts;
  return rest;
}

export function assertScriptsAllowed(
  descriptor: TriggerDescriptor,
  target: Record<string, unknown>,
): void {
  if (descriptor.standard?.scripts?.disabled !== true) {
    return;
  }
  const scripts = target.scripts;
  if (scripts === undefined || scripts === null || typeof scripts !== 'object') {
    return;
  }
  if ('pre' in scripts || 'post' in scripts) {
    throw new AddonException(
      'invalid_params',
      422,
      `trigger ${descriptor.kind} does not use scripts`,
    );
  }
}

/**
 * Groups are a presentation device: the dialog, the add-on and the stored config all use the
 * flat keys of the group's children, so a nested payload is squash onto the same shape.
 */
interface FlatConfig {
  values: Record<string, unknown>;
  groups: Set<string>;
}

function flattenConfig(fields: FieldSpec[], provided: Record<string, unknown>): FlatConfig {
  const values: Record<string, unknown> = {};
  const groups = new Set<string>();
  for (const [key, value] of Object.entries(provided)) {
    const field = fields.find((entry) => entry.key === key);
    if (field?.type === 'group' && isPlainObject(value)) {
      const nested = flattenConfig(field.fields ?? [], value);
      groups.add(key);
      for (const group of nested.groups) {
        groups.add(group);
      }
      Object.assign(values, nested.values);
      continue;
    }
    values[key] = value;
  }
  return { values, groups };
}

function configIssues(
  fields: FieldSpec[],
  config: Record<string, unknown>,
  groups: Set<string>,
): string[] {
  const paths = configPaths(fields);
  return fields.flatMap((field) => fieldIssues(field, config, paths, groups));
}

function fieldIssues(
  field: FieldSpec,
  config: Record<string, unknown>,
  paths: Map<string, string>,
  groups: Set<string>,
): string[] {
  if (!visible(field, config)) {
    return [];
  }
  const path = paths.get(field.key) ?? field.key;
  if (field.type !== 'group') {
    return scalarIssues(field, config[field.key], path);
  }
  if (groupEmpty(field, config) && !groups.has(field.key)) {
    return field.required ? [`${path}: required`] : [];
  }
  return (field.fields ?? []).flatMap((child) => fieldIssues(child, config, paths, groups));
}

function configPaths(fields: FieldSpec[], prefix = '', out = new Map<string, string>()) {
  for (const field of fields) {
    const path = prefix === '' ? field.key : `${prefix}.${field.key}`;
    out.set(field.key, path);
    if (field.type === 'group') {
      configPaths(field.fields ?? [], path, out);
    }
  }
  return out;
}

function groupEmpty(field: FieldSpec, config: Record<string, unknown>): boolean {
  return (field.fields ?? []).every((child) => {
    if (child.type === 'group') {
      return groupEmpty(child, config);
    }
    return isEmpty(config[child.key]);
  });
}

function scalarIssues(field: FieldSpec, value: unknown, path: string): string[] {
  if (isEmpty(value)) {
    return field.required ? [`${path}: required`] : [];
  }
  if (!typeMatches(field, value)) {
    return [`${path}: expected ${field.type}`];
  }
  return [...optionIssues(field, value, path), ...patternIssues(field, value, path)];
}

function optionIssues(field: FieldSpec, value: unknown, path: string): string[] {
  if (field.type !== 'select' || field.options === undefined || typeof value !== 'string') {
    return [];
  }
  const allowed = new Set(field.options.map((option) => option.value));
  const parts = field.multi
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : [value];
  const invalid = parts.filter((part) => !allowed.has(part));
  return invalid.length === 0 ? [] : [`${path}: must be one of ${[...allowed].join(', ')}`];
}

function patternIssues(field: FieldSpec, value: unknown, path: string): string[] {
  if (field.pattern === undefined || typeof value !== 'string') {
    return [];
  }
  try {
    return new RegExp(field.pattern.regex).test(value) ? [] : [`${path}: ${field.pattern.hint}`];
  } catch {
    return [];
  }
}

function typeMatches(field: FieldSpec, value: unknown): boolean {
  switch (field.type) {
    case 'number':
      return (
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
      );
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'group':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'select':
      return typeof value === 'string';
    default:
      return typeof value === 'string';
  }
}

function visible(field: FieldSpec, config: Record<string, unknown>): boolean {
  const when = field.visibleWhen;
  if (when === undefined) {
    return true;
  }
  const current = config[when.key];
  if (typeof current !== 'string') {
    return true;
  }
  if (when.equals !== undefined) {
    return current === when.equals;
  }
  if (when.oneOf !== undefined) {
    return when.oneOf.includes(current);
  }
  return true;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
