import { describe, expect, it } from 'bun:test';
import type { AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';
import { mergeAppFields, resolveAppFields } from './app-fields.ts';

const descriptor: AppKindDescriptor = {
  kind: 'test-app',
  label: 'Test app',
  description: '',
  fields: [
    {
      key: 'clientId',
      label: 'Client ID',
      secret: false,
      required: true,
      multiline: false,
      placeholder: '',
    },
    {
      key: 'clientSecret',
      label: 'Client secret',
      secret: true,
      required: true,
      multiline: false,
      placeholder: '',
    },
    {
      key: 'apiKey',
      label: 'API key',
      secret: true,
      required: false,
      multiline: false,
      placeholder: '',
    },
  ],
};

describe('resolveAppFields', () => {
  it('splits values and secrets by descriptor', () => {
    const result = resolveAppFields(descriptor, {
      values: { clientId: ' abc ' },
      secrets: { clientSecret: 's3cret' },
    });
    expect(result.values).toEqual({ clientId: 'abc' });
    expect(result.secrets).toEqual({ clientSecret: 's3cret' });
  });

  it('rejects unknown fields', () => {
    expect(() => resolveAppFields(descriptor, { values: { nope: 'x' }, secrets: {} })).toThrow();
  });

  it('rejects a secret field sent as a value', () => {
    expect(() =>
      resolveAppFields(descriptor, { values: { clientSecret: 'x' }, secrets: {} }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() =>
      resolveAppFields(descriptor, { values: { clientId: 'abc' }, secrets: {} }),
    ).toThrow();
  });
});

describe('mergeAppFields', () => {
  it('keeps stored secrets and merges values', () => {
    const result = mergeAppFields(descriptor, {
      currentValues: { clientId: 'abc' },
      storedSecretFields: ['clientSecret'],
      patch: { values: { clientId: 'def' }, secrets: {} },
    });
    expect(result.values).toEqual({ clientId: 'def' });
    expect(result.secrets).toEqual({});
    expect(result.removedSecrets).toEqual([]);
  });

  it('removes an optional secret sent as empty', () => {
    const result = mergeAppFields(descriptor, {
      currentValues: { clientId: 'abc' },
      storedSecretFields: ['clientSecret', 'apiKey'],
      patch: { values: {}, secrets: { apiKey: '' } },
    });
    expect(result.removedSecrets).toEqual(['apiKey']);
  });

  it('rejects removal of a required secret', () => {
    expect(() =>
      mergeAppFields(descriptor, {
        currentValues: { clientId: 'abc' },
        storedSecretFields: ['clientSecret'],
        patch: { values: {}, secrets: { clientSecret: '' } },
      }),
    ).toThrow();
  });
});
