import { ProviderError } from './errors.ts';
import type { FieldSpec } from './field.ts';

const FORM_FIELD_TYPES: readonly ('text' | 'number')[] = ['text', 'number'];

export function formLaunchViolations(fields: readonly FieldSpec[]): string[] {
  const violations: string[] = [];
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) {
      violations.push(`form field ${field.key} is declared more than once`);
    }
    keys.add(field.key);
    if (!FORM_FIELD_TYPES.includes(field.type as 'text' | 'number')) {
      violations.push(`form field ${field.key} has disallowed type ${field.type}`);
      continue;
    }
    if (field.generated) {
      violations.push(`form field ${field.key} must not be generated`);
    }
  }
  return violations;
}

export function assertFormLaunchFields(fields: readonly FieldSpec[]): void {
  if (formLaunchViolations(fields).length > 0) {
    throw new ProviderError('invalid_response');
  }
}
