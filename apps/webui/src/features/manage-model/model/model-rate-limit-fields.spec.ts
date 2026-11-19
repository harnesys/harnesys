import { describe, expect, test } from 'bun:test';
import {
  emptyModelFields,
  modelFieldsFrom,
  modelFieldsSchema,
  toEditorDraft,
} from './model-fields';
import { rateLimitFieldsFrom, rateLimitsSchema, toRateLimits } from './model-rate-limit-fields';

describe('rateLimitsSchema', () => {
  test('parses partial values into numbers', () => {
    const parsed = rateLimitsSchema.parse({ rpm: '60', rpd: '', tpm: '', tpd: ' 200000 ' });
    expect(parsed).toEqual({ rpm: 60, rpd: undefined, tpm: undefined, tpd: 200000 });
  });

  test('empty fields yield undefined', () => {
    expect(rateLimitsSchema.parse({ rpm: '', rpd: '', tpm: '', tpd: '' })).toEqual({
      rpm: undefined,
      rpd: undefined,
      tpm: undefined,
      tpd: undefined,
    });
  });

  test('rejects non-positive and non-numeric values', () => {
    expect(() => rateLimitsSchema.parse({ rpm: '0', rpd: '', tpm: '', tpd: '' })).toThrow();
    expect(() => rateLimitsSchema.parse({ rpm: '-1', rpd: '', tpm: '', tpd: '' })).toThrow();
    expect(() => rateLimitsSchema.parse({ rpm: 'abc', rpd: '', tpm: '', tpd: '' })).toThrow();
  });
});

describe('toRateLimits', () => {
  test('all-undefined means no limits', () => {
    expect(
      toRateLimits({ rpm: undefined, rpd: undefined, tpm: undefined, tpd: undefined }),
    ).toBeUndefined();
  });
});

describe('rateLimits round-trip', () => {
  test('editor draft preserves limits and fieldsFrom restores the strings', () => {
    const values = modelFieldsSchema.parse({
      ...emptyModelFields(),
      rateLimits: { rpm: '60', rpd: '', tpm: '', tpd: '200000' },
    });
    const draft = toEditorDraft(values);
    expect(draft.rateLimits).toEqual({ rpm: 60, tpd: 200000 });
    const fields = modelFieldsFrom({ stored: { name: 'roundtrip', ...draft } });
    expect(fields.rateLimits).toEqual({ rpm: '60', rpd: '', tpm: '', tpd: '200000' });
    const reparsed = modelFieldsSchema.parse({ ...emptyModelFields(), ...fields });
    expect(toEditorDraft(reparsed).rateLimits).toEqual({ rpm: 60, tpd: 200000 });
  });

  test('empty form leaves no rateLimits on the draft', () => {
    const values = modelFieldsSchema.parse(emptyModelFields());
    expect(toEditorDraft(values).rateLimits).toBeUndefined();
  });

  test('rateLimitFieldsFrom handles undefined limits', () => {
    expect(rateLimitFieldsFrom(undefined)).toEqual({ rpm: '', rpd: '', tpm: '', tpd: '' });
  });
});
