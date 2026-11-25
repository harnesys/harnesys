import { describe, expect, test } from 'bun:test';
import { TriggerTargetSchema } from './trigger-target.schema.ts';

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
