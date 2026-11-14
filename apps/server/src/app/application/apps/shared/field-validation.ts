import { randomBytes } from 'node:crypto';
import type { FieldErrorCode } from '../../../domain/apps/errors.ts';
import { InvalidFieldsException } from '../../../domain/apps/errors.ts';
import type { FieldSpec, FieldValue } from '../../../domain/apps/field.ts';

export interface ResolvedInput {
  values: Record<string, FieldValue>;
  secretValues: Record<string, string>;
}

export interface ResolvedPatch {
  values: Record<string, FieldValue>;
}

export interface ResolveInputOptions {
  requireRequired?: boolean;
}

export function resolveInputFields(
  fields: readonly FieldSpec[],
  raw: Record<string, unknown>,
  options: ResolveInputOptions = {},
): ResolvedInput {
  const resolution: InputResolution = {
    values: {},
    secretValues: {},
    errors: {},
    requireRequired: options.requireRequired !== false,
  };
  collectUnknownKeys(fields, raw, resolution.errors);
  for (const field of fields) {
    resolveInputField(field, raw[field.key], resolution);
  }
  throwIfErrors(resolution.errors);
  return { values: resolution.values, secretValues: resolution.secretValues };
}

export function resolveEditablePatch(
  fields: readonly FieldSpec[],
  raw: Record<string, unknown>,
): ResolvedPatch {
  const errors: Record<string, FieldErrorCode> = {};
  const values: Record<string, FieldValue> = {};
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const [key, supplied] of Object.entries(raw)) {
    const field = byKey.get(key);
    if (!field?.editable || field.type === 'secret' || field.generated) {
      errors[key] = field ? 'option' : 'unknown';
      continue;
    }
    resolveEditableField(field, supplied, values, errors);
  }
  throwIfErrors(errors);
  return { values };
}

export function valuesByFieldKeys(
  fields: readonly FieldSpec[],
  raw: Record<string, unknown>,
): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.generated || field.type === 'secret') {
      continue;
    }
    const value = raw[field.key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[field.key] = value;
    }
  }
  return output;
}

function collectUnknownKeys(
  fields: readonly FieldSpec[],
  raw: Record<string, unknown>,
  errors: Record<string, FieldErrorCode>,
): void {
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      errors[key] = 'unknown';
    }
  }
}

interface InputResolution {
  values: Record<string, FieldValue>;
  secretValues: Record<string, string>;
  errors: Record<string, FieldErrorCode>;
  requireRequired: boolean;
}

function resolveInputField(field: FieldSpec, supplied: unknown, resolution: InputResolution): void {
  if (field.generated) {
    const generated = randomToken();
    resolution.secretValues[field.key] = generated;
    resolution.values[field.key] = generated;
    return;
  }
  const outcome = coerceField(field, supplied);
  if (outcome.error !== undefined) {
    resolution.errors[field.key] = outcome.error;
    return;
  }
  if (outcome.value === undefined) {
    applyEmptyValue(field, resolution);
    return;
  }
  if (field.type === 'secret') {
    resolution.secretValues[field.key] = String(outcome.value);
  }
  resolution.values[field.key] = outcome.value;
}

function applyEmptyValue(field: FieldSpec, resolution: InputResolution): void {
  if (field.default !== undefined) {
    resolution.values[field.key] = field.default;
  } else if (field.required && resolution.requireRequired) {
    resolution.errors[field.key] = 'required';
  }
}

function resolveEditableField(
  field: FieldSpec,
  supplied: unknown,
  values: Record<string, FieldValue>,
  errors: Record<string, FieldErrorCode>,
): void {
  const outcome = coerceField(field, supplied);
  if (outcome.error !== undefined) {
    errors[field.key] = outcome.error;
    return;
  }
  if (outcome.value === undefined) {
    errors[field.key] = 'required';
    return;
  }
  values[field.key] = outcome.value;
}

function throwIfErrors(errors: Record<string, FieldErrorCode>): void {
  if (Object.keys(errors).length > 0) {
    throw new InvalidFieldsException(errors);
  }
}

interface CoerceOutcome {
  value?: FieldValue;
  error?: FieldErrorCode;
}

function coerceField(field: FieldSpec, supplied: unknown): CoerceOutcome {
  if (supplied === undefined || supplied === null || supplied === '') {
    return {};
  }
  switch (field.type) {
    case 'number':
      return coerceNumber(supplied);
    case 'boolean':
      return coerceBoolean(supplied);
    case 'select':
      return coerceSelect(field, supplied);
    case 'url':
      return coerceUrl(supplied);
    default:
      return coerceText(field, supplied);
  }
}

function coerceNumber(supplied: unknown): CoerceOutcome {
  const parsed = typeof supplied === 'number' ? supplied : Number(String(supplied));
  return Number.isFinite(parsed) ? { value: parsed } : { error: 'type' };
}

function coerceBoolean(supplied: unknown): CoerceOutcome {
  if (typeof supplied === 'boolean') {
    return { value: supplied };
  }
  if (supplied === 'true' || supplied === 'false') {
    return { value: supplied === 'true' };
  }
  return { error: 'type' };
}

function coerceSelect(field: FieldSpec, supplied: unknown): CoerceOutcome {
  const value = String(supplied);
  const allowed = (field.options ?? []).some((option) => option.value === value);
  return allowed ? { value } : { error: 'option' };
}

function coerceUrl(supplied: unknown): CoerceOutcome {
  const value = String(supplied).trim();
  return isHttpUrl(value) ? { value } : { error: 'type' };
}

function coerceText(field: FieldSpec, supplied: unknown): CoerceOutcome {
  const value = String(supplied).trim();
  if (value === '') {
    return {};
  }
  if (field.pattern && !new RegExp(field.pattern.regex).test(value)) {
    return { error: 'pattern' };
  }
  return { value };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
