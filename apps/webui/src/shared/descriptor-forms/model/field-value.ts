import type { FieldSpec, FieldValue } from '@harnesys/contracts';

export function fieldValue(
  field: FieldSpec,
  values: Record<string, FieldValue>,
): FieldValue | undefined {
  return field.key in values ? values[field.key] : field.default;
}

export function flatFields(fields: readonly FieldSpec[]): FieldSpec[] {
  const output: FieldSpec[] = [];
  for (const field of fields) {
    if (field.type === 'group') {
      output.push(...flatFields(field.fields ?? []));
      continue;
    }
    output.push(field);
  }
  return output;
}

export function initialFieldValues(
  fields: readonly FieldSpec[],
  existing: Record<string, FieldValue> = {},
): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of flatFields(fields)) {
    if (field.type === 'secret' || field.generated) {
      continue;
    }
    const value = field.key in existing ? existing[field.key] : field.default;
    if (value !== undefined) {
      output[field.key] = value;
    }
  }
  return output;
}

export function fieldInputs(
  fields: readonly FieldSpec[],
  values: Record<string, FieldValue>,
  secrets: Record<string, string>,
): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of flatFields(fields)) {
    if (field.generated) {
      continue;
    }
    const value = field.type === 'secret' ? secrets[field.key] : values[field.key];
    if (value !== undefined && value !== '') {
      output[field.key] = value;
    }
  }
  return output;
}
