import { describe, expect, test } from 'bun:test';
import { InvalidFieldsException } from '../../../domain/apps/errors.ts';
import type { FieldSpec } from '../../../domain/apps/field.ts';
import { resolveEditablePatch, resolveInputFields, valuesByFieldKeys } from './field-validation.ts';

function fieldOf(patch: Partial<FieldSpec> & Pick<FieldSpec, 'key' | 'type'>): FieldSpec {
  return { label: patch.key, required: false, ...patch };
}

function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof InvalidFieldsException) {
    return { ...error.fields };
  }
  throw error;
}

describe('resolveInputFields', () => {
  const fields: FieldSpec[] = [
    fieldOf({ key: 'name', type: 'text', required: true }),
    fieldOf({ key: 'token', type: 'secret', required: false }),
    fieldOf({
      key: 'region',
      type: 'select',
      required: true,
      options: [
        { value: 'eu', label: 'EU' },
        { value: 'us', label: 'US' },
      ],
    }),
    fieldOf({ key: 'slug', type: 'text', pattern: { regex: '^[a-z]+$', hint: 'lowercase' } }),
    fieldOf({ key: 'count', type: 'number' }),
    fieldOf({ key: 'flag', type: 'boolean' }),
    fieldOf({ key: 'site', type: 'url' }),
  ];

  test('coerces, applies defaults and resolves secrets', () => {
    const resolved = resolveInputFields(fields, {
      name: ' acme ',
      region: 'eu',
      count: '42',
      flag: 'true',
      site: 'https://acme.test',
      token: 'st-token',
    });
    expect(resolved.values).toEqual({
      name: 'acme',
      region: 'eu',
      count: 42,
      flag: true,
      site: 'https://acme.test',
      token: 'st-token',
    });
    expect(resolved.secretValues).toEqual({ token: 'st-token' });
  });

  test('rejects missing required, bad option, bad type and failing pattern', () => {
    try {
      resolveInputFields(fields, {
        region: 'mars',
        count: 'not-a-number',
        flag: 'maybe',
        site: 'not-a-url',
        slug: 'MIXED',
        extra: 'x',
      });
      expect.unreachable();
    } catch (error) {
      expect(fieldErrors(error)).toEqual({
        name: 'required',
        extra: 'unknown',
        region: 'option',
        count: 'type',
        flag: 'type',
        site: 'type',
        slug: 'pattern',
      });
    }
  });

  test('unknown keys are rejected', () => {
    try {
      resolveInputFields([], { nope: 1 });
      expect.unreachable();
    } catch (error) {
      expect(fieldErrors(error)).toEqual({ nope: 'unknown' });
    }
  });

  test('generated fields materialize random 32-byte base64url secrets', () => {
    const generated = fieldOf({ key: 'webhookSigningKey', type: 'secret', generated: true });
    const first = resolveInputFields([generated], {});
    const second = resolveInputFields([generated], { webhookSigningKey: 'st-ignored' });
    const shape = /^[A-Za-z0-9_-]{43}$/;
    expect(String(first.values.webhookSigningKey)).toMatch(shape);
    expect(String(second.values.webhookSigningKey)).toMatch(shape);
    expect(first.secretValues.webhookSigningKey).toBe(String(first.values.webhookSigningKey));
    expect(second.secretValues.webhookSigningKey).toBe(String(second.values.webhookSigningKey));
    expect(String(first.values.webhookSigningKey)).not.toBe(
      String(second.values.webhookSigningKey),
    );
  });

  test('valuesByFieldKeys skips secret and generated fields', () => {
    const values = valuesByFieldKeys(fields, {
      name: 'acme',
      token: 'st-token',
      nope: 'ignored',
    });
    expect(values).toEqual({ name: 'acme' });
  });
});

describe('resolveEditablePatch', () => {
  const fields: FieldSpec[] = [
    fieldOf({ key: 'clientId', type: 'text', editable: true }),
    fieldOf({ key: 'tenantUrl', type: 'url', editable: true }),
    fieldOf({ key: 'staticField', type: 'text', editable: false }),
    fieldOf({ key: 'token', type: 'secret' }),
    fieldOf({ key: 'webhookSigningKey', type: 'secret', generated: true }),
  ];

  test('accepts editable fields and coerces them', () => {
    const patch = resolveEditablePatch(fields, { clientId: ' acme ', tenantUrl: 'https://a.b' });
    expect(patch.values).toEqual({ clientId: 'acme', tenantUrl: 'https://a.b' });
  });

  test('rejects secret, generated, non-editable and unknown keys', () => {
    try {
      resolveEditablePatch(fields, {
        token: 'st-a',
        webhookSigningKey: 'st-b',
        staticField: 'x',
        ghost: 'y',
      });
      expect.unreachable();
    } catch (error) {
      expect(fieldErrors(error)).toEqual({
        token: 'option',
        webhookSigningKey: 'option',
        staticField: 'option',
        ghost: 'unknown',
      });
    }
  });

  test('requires a value for every supplied editable key', () => {
    try {
      resolveEditablePatch(fields, { clientId: undefined });
      expect.unreachable();
    } catch (error) {
      expect(fieldErrors(error)).toEqual({ clientId: 'required' });
    }
  });
});
