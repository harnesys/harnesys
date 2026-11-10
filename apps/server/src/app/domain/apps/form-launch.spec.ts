import { describe, expect, test } from 'bun:test';
import type { FieldSpec } from './field.ts';
import { formLaunchViolations } from './form-launch.ts';

function field(overrides: Partial<FieldSpec> & { key: string }): FieldSpec {
  return {
    label: 'Value',
    type: 'text',
    required: true,
    ...overrides,
  };
}

describe('form launch fields', () => {
  test('text and number fields are accepted', () => {
    const fields = [field({ key: 'phone', type: 'text' }), field({ key: 'code', type: 'number' })];
    expect(formLaunchViolations(fields)).toEqual([]);
  });

  test('empty field list is accepted', () => {
    expect(formLaunchViolations([])).toEqual([]);
  });

  test('secret, generated and other typed fields are rejected fail-closed', () => {
    const fields = [
      field({ key: 'apiKey', type: 'secret' }),
      field({ key: 'token', type: 'text', generated: true }),
      field({ key: 'note', type: 'textarea' }),
      field({ key: 'site', type: 'url' }),
      field({ key: 'kind', type: 'select' }),
      field({ key: 'flag', type: 'boolean' }),
    ];
    const violations = formLaunchViolations(fields);
    expect(violations.length).toBe(6);
    expect(violations.some((violation) => violation.includes('apiKey'))).toBe(true);
    expect(violations.some((violation) => violation.includes('token'))).toBe(true);
    expect(violations.some((violation) => violation.includes('boolean'))).toBe(true);
  });

  test('duplicate keys are rejected', () => {
    const violations = formLaunchViolations([field({ key: 'code' }), field({ key: 'code' })]);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('more than once');
  });
});
