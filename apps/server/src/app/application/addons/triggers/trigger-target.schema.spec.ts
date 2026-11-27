import { describe, expect, test } from 'bun:test';
import { scriptsIssueMessages, TriggerTargetSchema } from './trigger-target.schema.ts';

const BASE = {
  threadId: '11111111-1111-4111-8111-111111111111',
  agentId: '22222222-2222-4222-8222-222222222222',
};

const PRE = {
  script: { command: 'git pull --ff-only' },
  onError: 'skip-run',
  injectStdout: false,
  onWorkspaceMissing: 'skip-run',
};

describe('TriggerTargetSchema scripts', () => {
  test('a target without scripts keeps parsing', () => {
    const parsed = TriggerTargetSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
  });

  test('a script requires an explicit acknowledgement', () => {
    const rejected = TriggerTargetSchema.safeParse({
      ...BASE,
      scripts: { acknowledged: false, pre: PRE },
    });
    expect(rejected.success).toBe(false);

    const accepted = TriggerTargetSchema.safeParse({
      ...BASE,
      scripts: { acknowledged: true, pre: PRE },
    });
    expect(accepted.success).toBe(true);
  });

  test('an acknowledged object without scripts is allowed', () => {
    const parsed = TriggerTargetSchema.safeParse({
      ...BASE,
      scripts: { acknowledged: true },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('TriggerTargetSchema agent mode', () => {
  test('conditional requires an escalation rule', () => {
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: { acknowledged: true, pre: PRE, agent: 'conditional' },
      }).success,
    ).toBe(false);
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: {
          acknowledged: true,
          pre: PRE,
          agent: 'conditional',
          escalate: { onFailure: true },
        },
      }).success,
    ).toBe(true);
  });

  test('escalation rules outside conditional mode are rejected', () => {
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: {
          acknowledged: true,
          pre: PRE,
          agent: 'never',
          escalate: { onFailure: true },
        },
      }).success,
    ).toBe(false);
  });

  test('legacy scripts default to the always agent mode', () => {
    const parsed = TriggerTargetSchema.safeParse({
      ...BASE,
      scripts: { acknowledged: true, pre: PRE },
    });
    expect(parsed.success && parsed.data.scripts?.agent).toBe('always');
  });

  test('a non-always agent mode requires a pre script', () => {
    expect(
      TriggerTargetSchema.safeParse({ ...BASE, scripts: { acknowledged: true, agent: 'never' } })
        .success,
    ).toBe(false);
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: { acknowledged: true, agent: 'never', post: { script: { command: 'report' } } },
      }).success,
    ).toBe(false);
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: { acknowledged: true, agent: 'never', pre: PRE },
      }).success,
    ).toBe(true);
  });

  test('a conditional without a live rule is rejected', () => {
    expect(
      TriggerTargetSchema.safeParse({
        ...BASE,
        scripts: {
          acknowledged: true,
          pre: PRE,
          agent: 'conditional',
          escalate: { onFailure: false },
        },
      }).success,
    ).toBe(false);
  });
});

describe('scriptsIssueMessages', () => {
  test('collapses every scripts issue into one path-prefixed line', () => {
    const rejected = TriggerTargetSchema.safeParse({
      ...BASE,
      scripts: {
        acknowledged: true,
        pre: { ...PRE, gate: { on: 'stdout' } },
        agent: 'sometimes',
      },
    });
    const messages = rejected.success ? [] : scriptsIssueMessages(rejected.error);
    expect(rejected.success).toBe(false);
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.startsWith('scripts.')).toBe(true);
    }
    expect(messages.some((message) => message.startsWith('scripts.agent:'))).toBe(true);
    expect(messages.some((message) => message.startsWith('scripts.pre.gate.'))).toBe(true);
  });

  test('ignores issues outside the scripts field', () => {
    const rejected = TriggerTargetSchema.safeParse({ threadId: 'nope', agentId: 'nope' });
    const messages = rejected.success ? [] : scriptsIssueMessages(rejected.error);
    expect(messages).toEqual([]);
  });
});
