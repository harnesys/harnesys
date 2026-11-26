import { describe, expect, test } from 'bun:test';
import type { FieldSpec, TriggerDescriptor } from '@harnesys/sdk';
import {
  assertScriptsAllowed,
  mergeTriggerConfig,
  normalizeTargetScripts,
} from './automation-config.ts';

const fields: FieldSpec[] = [
  { key: 'query', label: 'Query', type: 'text', required: true },
  {
    key: 'mode',
    label: 'Mode',
    type: 'select',
    required: true,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
  {
    key: 'auth',
    label: 'Auth',
    type: 'select',
    required: false,
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'apiKey', label: 'API key' },
    ],
  },
  {
    key: 'key',
    label: 'Key',
    type: 'text',
    required: true,
    visibleWhen: { key: 'auth', equals: 'apiKey' },
  },
  {
    key: 'prefix',
    label: 'Prefix',
    type: 'text',
    required: false,
    pattern: { regex: '^[a-z]+$', hint: 'lowercase letters only' },
  },
  {
    key: 'payload',
    label: 'Payload',
    type: 'group',
    required: false,
    fields: [{ key: 'textPath', label: 'Text path', type: 'text', required: true }],
  },
];

const descriptor: TriggerDescriptor = {
  kind: 'acme.feed',
  title: 'Feed',
  description: '',
  configFields: fields,
};

describe('mergeTriggerConfig', () => {
  test('applies defaults and accepts a valid config', () => {
    expect(mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a' })).toEqual({
      query: 'q',
      mode: 'a',
      auth: 'none',
    });
  });

  test('rejects a missing required field', () => {
    expect(() => mergeTriggerConfig(descriptor, {}, { mode: 'a' })).toThrow(/query: required/);
  });

  test('rejects a value outside the select options', () => {
    expect(() => mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'z' })).toThrow(
      /mode: must be one of a, b/,
    );
  });

  test('requires a conditionally visible field only when visible', () => {
    expect(() => mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a' })).not.toThrow();
    expect(() =>
      mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a', auth: 'apiKey' }),
    ).toThrow(/key: required/);
  });

  test('validates nested group fields and text patterns', () => {
    expect(() =>
      mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a', payload: {} }),
    ).toThrow(/payload\.textPath: required/);
    expect(() =>
      mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a', prefix: 'ABC' }),
    ).toThrow(/prefix: lowercase letters only/);
  });

  test('flattens a nested group into the stored shape', () => {
    expect(
      mergeTriggerConfig(
        descriptor,
        {},
        { query: 'q', mode: 'a', payload: { textPath: 'issue.title' } },
      ),
    ).toEqual({ query: 'q', mode: 'a', auth: 'none', textPath: 'issue.title' });
  });

  test('accepts a flat group child and validates it with the dotted path', () => {
    expect(
      mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a', textPath: 'issue.title' }),
    ).toEqual({ query: 'q', mode: 'a', auth: 'none', textPath: 'issue.title' });
    expect(() =>
      mergeTriggerConfig(descriptor, {}, { query: 'q', mode: 'a', payload: {} }),
    ).toThrow(/payload\.textPath: required/);
  });

  test('merges into the current config on update', () => {
    expect(mergeTriggerConfig(descriptor, { query: 'old', mode: 'a' }, { query: 'new' })).toEqual({
      query: 'new',
      mode: 'a',
      auth: 'none',
    });
  });
});

describe('assertScriptsAllowed', () => {
  test('allows scripts by default', () => {
    expect(() =>
      assertScriptsAllowed(descriptor, { scripts: { pre: { script: { command: 'x' } } } }),
    ).not.toThrow();
  });

  test('rejects scripts when the descriptor disables the block', () => {
    const blocked: TriggerDescriptor = { ...descriptor, standard: { scripts: { disabled: true } } };
    expect(() =>
      assertScriptsAllowed(blocked, { scripts: { pre: { script: { command: 'x' } } } }),
    ).toThrow(/does not use scripts/);
    expect(() => assertScriptsAllowed(blocked, { scripts: {} })).not.toThrow();
  });
});

describe('normalizeTargetScripts', () => {
  test('drops an empty scripts wrapper and keeps a real one', () => {
    expect(normalizeTargetScripts({ threadId: 't', scripts: { acknowledged: true } })).toEqual({
      threadId: 't',
    });
    const kept = { threadId: 't', scripts: { pre: { script: { command: 'x' } } } };
    expect(normalizeTargetScripts(kept)).toBe(kept);
  });
});
