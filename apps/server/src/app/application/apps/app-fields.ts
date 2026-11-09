import type { AppFieldDescriptor, AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';
import { AppFieldsInvalidException } from '../../domain/apps/apps.error.ts';

export interface AppFieldInput {
  values: Record<string, string>;
  secrets: Record<string, string>;
}

export interface AppFieldValues {
  values: Record<string, string>;
  secrets: Record<string, string>;
}

export interface AppFieldMergeInput {
  currentValues: Record<string, string>;
  storedSecretFields: readonly string[];
  patch: AppFieldInput;
}

export interface AppFieldMergeResult {
  values: Record<string, string>;
  secrets: Record<string, string>;
  removedSecrets: string[];
}

export function resolveAppFields(
  descriptor: AppKindDescriptor,
  input: AppFieldInput,
): AppFieldValues {
  const fields = indexFields(descriptor);
  rejectUnknown(descriptor, Object.keys(input.values), 'values');
  rejectUnknown(descriptor, Object.keys(input.secrets), 'secrets');
  const values = collectValues(fields, input.values);
  const secrets = collectSecrets(fields, input.secrets);
  requireFields({ descriptor, values, secrets });
  return { values, secrets };
}

export function mergeAppFields(
  descriptor: AppKindDescriptor,
  input: AppFieldMergeInput,
): AppFieldMergeResult {
  const fields = indexFields(descriptor);
  rejectUnknown(descriptor, Object.keys(input.patch.values), 'values');
  rejectUnknown(descriptor, Object.keys(input.patch.secrets), 'secrets');
  const values = applyValuePatch(fields, input.currentValues, input.patch.values);
  const { secrets, removedSecrets } = applySecretPatch(fields, input.patch.secrets);
  requireFields({
    descriptor,
    values,
    secrets,
    stored: new Set(input.storedSecretFields),
    removed: removedSecrets,
  });
  return { values, secrets, removedSecrets };
}

export function nextSecretFields(
  storedSecretFields: readonly string[],
  merged: AppFieldMergeResult,
): string[] {
  const removed = new Set(merged.removedSecrets);
  const fields = new Set(storedSecretFields.filter((field) => !removed.has(field)));
  for (const field of Object.keys(merged.secrets)) {
    fields.add(field);
  }
  return [...fields].sort();
}

interface RequireFieldsInput {
  descriptor: AppKindDescriptor;
  values: Record<string, string>;
  secrets: Record<string, string>;
  stored?: ReadonlySet<string>;
  removed?: readonly string[];
}

function requireFields(input: RequireFieldsInput): void {
  const stored = input.stored ?? new Set<string>();
  const removed = input.removed ?? [];
  const missing = input.descriptor.fields
    .filter((field) => field.required)
    .filter((field) => isMissing(field, input.values, input.secrets, stored, removed))
    .map((field) => field.key);
  if (missing.length > 0) {
    throw new AppFieldsInvalidException(`Missing required app fields: ${missing.join(', ')}`, {
      missing,
    });
  }
}

function isMissing(
  field: AppFieldDescriptor,
  values: Record<string, string>,
  secrets: Record<string, string>,
  stored: ReadonlySet<string>,
  removed: readonly string[],
): boolean {
  if (!field.secret) {
    return !values[field.key];
  }
  if (secrets[field.key]) {
    return false;
  }
  return !stored.has(field.key) || removed.includes(field.key);
}

function collectValues(
  fields: Map<string, AppFieldDescriptor>,
  input: Record<string, string>,
): Record<string, string> {
  validateValuesShape(fields, input);
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = raw.trim();
    if (value) {
      values[key] = value;
    }
  }
  return values;
}

function collectSecrets(
  fields: Map<string, AppFieldDescriptor>,
  input: Record<string, string>,
): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = fields.get(key);
    if (field && !field.secret) {
      throw new AppFieldsInvalidException(`Field ${key} is not secret and must be sent in values`, {
        field: key,
      });
    }
    const value = raw.trim();
    if (value) {
      secrets[key] = value;
    }
  }
  return secrets;
}

function validateValuesShape(
  fields: Map<string, AppFieldDescriptor>,
  input: Record<string, string>,
): void {
  for (const key of Object.keys(input)) {
    if (fields.get(key)?.secret) {
      throw new AppFieldsInvalidException(`Field ${key} is secret and must be sent in secrets`, {
        field: key,
      });
    }
  }
}

function applyValuePatch(
  fields: Map<string, AppFieldDescriptor>,
  current: Record<string, string>,
  patch: Record<string, string>,
): Record<string, string> {
  validateValuesShape(fields, patch);
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(current)) {
    const value = raw.trim();
    if (value) {
      values[key] = value;
    }
  }
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw.trim();
    if (value) {
      values[key] = value;
    } else {
      delete values[key];
    }
  }
  return values;
}

function applySecretPatch(
  fields: Map<string, AppFieldDescriptor>,
  patch: Record<string, string>,
): { secrets: Record<string, string>; removedSecrets: string[] } {
  const secrets: Record<string, string> = {};
  const removedSecrets: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    const field = fields.get(key);
    if (field && !field.secret) {
      throw new AppFieldsInvalidException(`Field ${key} is not secret and must be sent in values`, {
        field: key,
      });
    }
    const value = raw.trim();
    if (value) {
      secrets[key] = value;
    } else {
      removedSecrets.push(key);
    }
  }
  return { secrets, removedSecrets };
}

function indexFields(descriptor: AppKindDescriptor): Map<string, AppFieldDescriptor> {
  return new Map(descriptor.fields.map((field) => [field.key, field]));
}

function rejectUnknown(
  descriptor: AppKindDescriptor,
  keys: readonly string[],
  group: 'values' | 'secrets',
): void {
  const known = new Set(descriptor.fields.map((field) => field.key));
  const unknown = keys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new AppFieldsInvalidException(`Unknown app fields in ${group}: ${unknown.join(', ')}`, {
      unknown,
    });
  }
}
