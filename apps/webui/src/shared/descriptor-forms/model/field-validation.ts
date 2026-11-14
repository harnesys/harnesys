import type { FieldErrorCode, FieldSpec, FieldValue } from '@harnesys/contracts';
import { fieldVisible } from '@harnesys/contracts';
import { parseCommaList } from './comma-list.ts';
import { FIELD_ERROR_TEXT } from './field-error-text.ts';
import { fieldValue } from './field-value.ts';

export type FieldErrors = Record<string, string>;

export function buildValidator(
  fields: FieldSpec[],
  existingSecrets: string[] = [],
): (values: Record<string, FieldValue>, secrets: Record<string, string>) => FieldErrors {
  return (values, secrets) => {
    const errors: FieldErrors = {};
    collectErrors(fields, values, secrets, existingSecrets, errors);
    return errors;
  };
}

function collectErrors(
  fields: FieldSpec[],
  values: Record<string, FieldValue>,
  secrets: Record<string, string>,
  existingSecrets: string[],
  errors: FieldErrors,
): void {
  for (const field of fields) {
    if (field.generated || !fieldVisible(field, values)) {
      continue;
    }
    if (field.type === 'group') {
      collectErrors(field.fields ?? [], values, secrets, existingSecrets, errors);
      continue;
    }
    const error = validateField(field, values, secrets, existingSecrets);
    if (error) {
      errors[field.key] = error;
    }
  }
}

function validateField(
  field: FieldSpec,
  values: Record<string, FieldValue>,
  secrets: Record<string, string>,
  existingSecrets: string[],
): string | null {
  if (field.generated) {
    return null;
  }
  if (field.type === 'secret') {
    const value = secrets[field.key] ?? '';
    if (field.required && !value && !existingSecrets.includes(field.key)) {
      return FIELD_ERROR_TEXT.required;
    }
    return null;
  }
  const value = fieldValue(field, values);
  if (field.required && (value === undefined || value === '')) {
    return FIELD_ERROR_TEXT.required;
  }
  if (value === undefined || value === '') {
    return null;
  }
  return validateTypedValue(field, value);
}

function validateTypedValue(field: FieldSpec, value: FieldValue): string | null {
  if (field.type === 'url' && !isHttpUrl(String(value))) {
    return 'Enter an http or https URL';
  }
  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    return 'Enter a number';
  }
  if (field.multi && field.options) {
    const allowed = new Set(field.options.map((option) => option.value));
    const tokens = parseCommaList(value);
    return tokens.every((token) => allowed.has(token)) ? null : FIELD_ERROR_TEXT.option;
  }
  if (
    field.type === 'select' &&
    !field.optionsFrom &&
    !field.options?.some((option) => option.value === String(value))
  ) {
    return FIELD_ERROR_TEXT.option;
  }
  return validatePattern(field, String(value));
}

function validatePattern(field: FieldSpec, value: string): string | null {
  if (!field.pattern) {
    return null;
  }
  try {
    return new RegExp(field.pattern.regex).test(value) ? null : field.pattern.hint;
  } catch {
    return FIELD_ERROR_TEXT.pattern;
  }
}

export function fieldErrorsFromBody(body: unknown): FieldErrors {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const record = body as { fields?: Record<string, FieldErrorCode> };
  if (!record.fields) {
    return {};
  }
  const errors: FieldErrors = {};
  for (const [key, code] of Object.entries(record.fields)) {
    errors[key] = FIELD_ERROR_TEXT[code] ?? FIELD_ERROR_TEXT.unknown;
  }
  return errors;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
