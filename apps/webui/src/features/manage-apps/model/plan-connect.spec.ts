import { describe, expect, test } from 'bun:test';
import type { AccountKindDescriptor, AppView } from '@harnesys/contracts';
import { connectReducer, currentStep, initialConnectState } from './connect-machine.ts';
import { buildValidator } from './field-validation.ts';
import { planConnect } from './plan-connect.ts';

const KIND: AccountKindDescriptor = {
  kind: 'test-account',
  provider: 'test',
  label: 'Test account',
  description: 'Fixture account kind',
  requiresApp: ['test-app'],
  inputs: [{ key: 'endpoint', label: 'Endpoint', type: 'url', required: true }],
  scopes: { options: [{ key: 'read', label: 'Read' }], defaults: ['read'] },
  access: { source: 'stored', keys: ['token'] },
  endpoints: [],
  capabilities: { revoke: false, webhook: false },
};

const APP: AppView = {
  id: 'app-1',
  kind: 'test-app',
  label: 'Test app',
  status: 'configured',
  lastError: null,
  values: {},
  secretFields: [],
  endpoints: {},
  verifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('planConnect', () => {
  test('creates the app first when none exists', () => {
    expect(planConnect(KIND, [])).toEqual(['app', 'inputs', 'scopes', 'connect']);
  });

  test('skips the app step when one candidate exists', () => {
    expect(planConnect(KIND, [APP])).toEqual(['inputs', 'scopes', 'connect']);
  });

  test('asks which app when several exist', () => {
    expect(planConnect(KIND, [APP, APP])).toEqual(['pick-app', 'inputs', 'scopes', 'connect']);
  });

  test('reconnect keeps inputs and scopes, but skips the app step', () => {
    expect(planConnect(KIND, [APP], true)).toEqual(['inputs', 'scopes', 'connect']);
  });
});

describe('connectReducer', () => {
  test('advances and skips pick-app after an app is created', () => {
    const started = connectReducer(initialConnectState(), {
      type: 'start',
      steps: ['app', 'pick-app', 'inputs', 'connect'],
    });
    const next = connectReducer(started, { type: 'app-created', appId: 'a1' });
    expect(currentStep(next)).toBe('inputs');
  });

  test('a failed session keeps the steps for retry', () => {
    const started = connectReducer(initialConnectState(), {
      type: 'start',
      steps: ['connect'],
    });
    const failed = connectReducer(started, { type: 'failed', error: 'denied' });
    expect(failed.phase).toBe('failed');
    expect(connectReducer(failed, { type: 'retry' }).phase).toBe('step');
  });
});

describe('buildValidator', () => {
  test('reports required, url and pattern errors from the descriptor', () => {
    const validate = buildValidator([
      { key: 'endpoint', label: 'Endpoint', type: 'url', required: true },
      {
        key: 'code',
        label: 'Code',
        type: 'text',
        required: false,
        pattern: { regex: '^A', hint: 'Starts with A' },
      },
      { key: 'token', label: 'Token', type: 'secret', required: true },
    ]);
    const errors = validate({ endpoint: 'not-a-url', code: 'B' }, {});
    expect(Object.keys(errors).sort()).toEqual(['code', 'endpoint', 'token']);
  });

  test('accepts an existing secret without a new value', () => {
    const validate = buildValidator(
      [{ key: 'token', label: 'Token', type: 'secret', required: true }],
      ['token'],
    );
    expect(validate({}, {})).toEqual({});
  });
});
