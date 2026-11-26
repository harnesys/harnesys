import { describe, expect, test } from 'bun:test';
import { TriggerGateSchema, TriggerPostSchema, TriggerPreSchema } from '@harnesys/contracts';
import { decidePreScript, evaluateGate, postScriptApplies } from './trigger-script-policy.ts';

const CLEAN = { exitCode: 0, stdout: '', stderr: '', timedOut: false, aborted: false };

describe('evaluateGate', () => {
  test('stdout contains decides on a passing exit', () => {
    const gate = TriggerGateSchema.parse({ on: 'stdout', match: 'contains', value: 'CHANGES' });
    expect(evaluateGate(gate, { ...CLEAN, stdout: '2 CHANGES\n' })).toBe('passed');
    expect(evaluateGate(gate, { ...CLEAN, stdout: 'nothing' })).toBe('unmatched');
    expect(evaluateGate(gate, { ...CLEAN, exitCode: 1, stdout: 'CHANGES' })).toBe('unmatched');
  });

  test('json gate reads a dotted path', () => {
    const gate = TriggerGateSchema.parse({ on: 'json', path: 'result.ready', op: 'truthy' });
    expect(evaluateGate(gate, { ...CLEAN, stdout: '{"result":{"ready":true}}' })).toBe('passed');
    expect(evaluateGate(gate, { ...CLEAN, stdout: '{"result":{"ready":false}}' })).toBe(
      'unmatched',
    );
    expect(evaluateGate(gate, { ...CLEAN, stdout: 'not json' })).toBe('unmatched');
  });

  test('exit-code gate accepts only listed codes', () => {
    const gate = TriggerGateSchema.parse({ on: 'exit-code', pass: [0, 3] });
    expect(evaluateGate(gate, { ...CLEAN })).toBe('passed');
    expect(evaluateGate(gate, { ...CLEAN, exitCode: 3 })).toBe('passed');
    expect(evaluateGate(gate, { ...CLEAN, exitCode: 1 })).toBe('unmatched');
  });

  test('an invalid regex is rejected by the schema', () => {
    expect(TriggerGateSchema.safeParse({ on: 'stdout', match: 'regex', value: '([' }).success).toBe(
      false,
    );
  });

  test('regex gate matches trimmed stdout', () => {
    const gate = TriggerGateSchema.parse({ on: 'stdout', match: 'regex', value: '^CHANGES$' });
    expect(evaluateGate(gate, { ...CLEAN, stdout: 'CHANGES\n' })).toBe('passed');
    expect(evaluateGate(gate, { ...CLEAN, stdout: 'NO_CHANGES\n' })).toBe('unmatched');
  });
});

describe('decidePreScript', () => {
  const pre = TriggerPreSchema.parse({ script: { command: 'check' } });

  test('exit 2 blocks the run regardless of the error policy', () => {
    const decision = decidePreScript({
      pre: { ...pre, onError: 'run-with-note' },
      result: { ...CLEAN, exitCode: 2, stderr: 'no' },
      gateVerdict: 'not-applied',
    });
    expect(decision).toEqual({ kind: 'skip', reason: 'script-blocked', status: 'blocked' });
  });

  test('a failing script follows the error policy', () => {
    const skip = decidePreScript({
      pre,
      result: { ...CLEAN, exitCode: 1, stderr: 'boom' },
      gateVerdict: 'not-applied',
    });
    expect(skip).toEqual({ kind: 'skip', reason: 'script-failed', status: 'failed' });

    const noted = decidePreScript({
      pre: { ...pre, onError: 'run-with-note' },
      result: { ...CLEAN, exitCode: 1, stderr: 'boom' },
      gateVerdict: 'not-applied',
    });
    expect(noted.kind).toBe('run');
    expect(noted.kind === 'run' ? noted.note?.includes('boom') : false).toBe(true);
  });

  test('a gate mismatch suppresses without an error', () => {
    const gate = TriggerGateSchema.parse({ on: 'stdout', match: 'contains', value: 'GO' });
    const decision = decidePreScript({
      pre: { ...pre, gate },
      result: { ...CLEAN, stdout: 'nope' },
      gateVerdict: 'unmatched',
    });
    expect(decision).toEqual({ kind: 'skip', reason: 'gate-unmatched', status: 'skipped' });
  });
});

describe('postScriptApplies', () => {
  const post = TriggerPostSchema.parse({ script: { command: 'report' }, when: 'failure' });

  test('failure covers failed and cancelled runs', () => {
    expect(postScriptApplies(post.when, 'failed')).toBe(true);
    expect(postScriptApplies(post.when, 'cancelled')).toBe(true);
    expect(postScriptApplies(post.when, 'completed')).toBe(false);
  });
});
