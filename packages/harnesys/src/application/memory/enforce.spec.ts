import { describe, expect, test } from 'bun:test';
import type { HookOutcome } from '../hooks/bus.ts';
import { hookRemindEffect } from '../hooks/emit-hook.ts';
import { type EnforceGateInput, enforceNudge } from './enforce.ts';

const base: EnforceGateInput = {
  enforce: true,
  level: 'top',
  closing: false,
  memoryWrites: 0,
  steps: 5,
  nudges: 0,
  minSteps: 3,
  maxNudges: 1,
};

describe('enforceNudge', () => {
  test('all conditions met fires', () => {
    expect(enforceNudge(base)).toBe(true);
  });
  test.each([
    ['enforce off', { enforce: false }],
    ['delegate level', { level: 'delegate' }],
    ['closing', { closing: true }],
    ['memory already written', { memoryWrites: 1 }],
    ['below minSteps', { steps: 2 }],
    ['nudges exhausted', { nudges: 1 }],
  ])('%s does not fire', (_name, patch) => {
    expect(enforceNudge({ ...base, ...patch })).toBeUndefined();
  });
});

describe('hookRemindEffect', () => {
  test('extracts remind effect from the list', () => {
    const outcome: HookOutcome = {
      diagnostics: [],
      effects: [
        { kind: 'context', text: 'noise' },
        { kind: 'remind', text: 'save it' },
      ],
    };
    expect(hookRemindEffect(outcome)?.text).toBe('save it');
  });
  test('absent effects yield undefined', () => {
    expect(hookRemindEffect(undefined)).toBeUndefined();
    expect(
      hookRemindEffect({ effects: [{ kind: 'context', text: 'x' }], diagnostics: [] }),
    ).toBeUndefined();
  });
});
