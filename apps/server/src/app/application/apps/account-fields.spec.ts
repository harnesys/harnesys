import { describe, expect, it } from 'bun:test';
import { mergeAccountFields } from './account-fields.ts';

describe('mergeAccountFields', () => {
  it('writes incoming credentials and keeps stored secret fields', () => {
    const result = mergeAccountFields({
      currentValues: { project: 'p1' },
      currentSecretFields: ['refreshToken'],
      patch: { values: {}, credentials: { apiKey: 'k1' } },
    });
    expect(result.credentials).toEqual({ apiKey: 'k1' });
    expect(result.removedSecrets).toEqual([]);
    expect(result.secretFields).toEqual(['apiKey', 'refreshToken']);
    expect(result.values).toEqual({ project: 'p1' });
  });

  it('clears a secret field sent as an empty string', () => {
    const result = mergeAccountFields({
      currentValues: {},
      currentSecretFields: ['apiKey', 'refreshToken'],
      patch: { values: {}, credentials: { apiKey: '' } },
    });
    expect(result.credentials).toEqual({});
    expect(result.removedSecrets).toEqual(['apiKey']);
    expect(result.secretFields).toEqual(['refreshToken']);
  });

  it('replaces a value and drops it when the patch is empty', () => {
    const result = mergeAccountFields({
      currentValues: { project: 'p1' },
      currentSecretFields: [],
      patch: { values: { project: 'p2' }, credentials: {} },
    });
    expect(result.values).toEqual({ project: 'p2' });
    const cleared = mergeAccountFields({
      currentValues: { project: 'p2' },
      currentSecretFields: [],
      patch: { values: { project: '' }, credentials: {} },
    });
    expect(cleared.values).toEqual({});
  });
});
