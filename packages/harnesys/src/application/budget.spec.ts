import { describe, expect, test } from 'bun:test';
import {
  type BudgetState,
  budgetInterruptId,
  budgetLeft,
  budgetLimitOf,
  budgetOver,
  budgetReason,
  budgetUsedOf,
  defaultExtension,
  effectiveDeadlineAt,
  effectiveSteps,
  effectiveTokens,
  extendState,
} from './budget.ts';

function stateOf(over: Partial<BudgetState>): BudgetState {
  return { steps: 4, tokens: 120, startedAt: 1000, ...over };
}

describe('effective limits', () => {
  test('an extension moves the step and token limits', () => {
    const state = stateOf({
      budget: { maxSteps: 40, maxTokens: 1000, deadlineMs: 60000 },
      extend: { steps: 12, tokens: 100 },
    });
    expect(effectiveSteps(state)).toBe(52);
    expect(effectiveTokens(state)).toBe(1100);
  });

  test('the deadline is an absolute moment', () => {
    const state = stateOf({ budget: { deadlineMs: 60000 } });
    expect(effectiveDeadlineAt(state)).toBe(61000);
    expect(effectiveDeadlineAt(stateOf({ budget: { deadlineMs: 60000 }, deadlineAt: 90000 }))).toBe(
      90000,
    );
  });

  test('no budget means no limits', () => {
    expect(effectiveSteps(stateOf({}))).toBeUndefined();
    expect(effectiveTokens(stateOf({}))).toBeUndefined();
    expect(effectiveDeadlineAt(stateOf({}))).toBeUndefined();
  });
});

describe('budgetOver', () => {
  test('reports the exhausted limit', () => {
    expect(budgetOver(stateOf({ budget: { maxSteps: 4 } }), 2000)).toEqual({
      kind: 'steps',
      limit: 4,
      used: 4,
    });
    expect(budgetOver(stateOf({ budget: { maxTokens: 100 } }), 2000)).toEqual({
      kind: 'tokens',
      limit: 100,
      used: 120,
    });
    expect(budgetOver(stateOf({ budget: { deadlineMs: 500 } }), 2000)).toEqual({
      kind: 'deadline',
      limit: 500,
      used: 1000,
    });
  });

  test('an extension moves the limit', () => {
    expect(budgetOver(stateOf({ budget: { maxSteps: 4 }, extend: { steps: 2 } }), 2000)).toBeNull();
    expect(
      budgetOver(stateOf({ budget: { maxSteps: 4 }, extend: { steps: 1 }, steps: 5 }), 2000),
    ).toEqual({
      kind: 'steps',
      limit: 5,
      used: 5,
    });
  });

  test('other limits keep blocking after one is extended', () => {
    expect(
      budgetOver(
        stateOf({ budget: { maxSteps: 4, deadlineMs: 500 }, extend: { steps: 10 } }),
        2000,
      ),
    ).toEqual({
      kind: 'deadline',
      limit: 500,
      used: 1000,
    });
  });

  test('no budget never blocks', () => {
    expect(budgetOver(stateOf({}), 2000)).toBeNull();
    expect(budgetOver(stateOf({ budget: {} }), 2000)).toBeNull();
  });
});

describe('budgetReason', () => {
  test('names the exhausted limit', () => {
    expect(budgetReason({ kind: 'steps', limit: 40, used: 40 })).toBe('Step budget of 40 reached');
    expect(budgetReason({ kind: 'tokens', limit: 900, used: 950 })).toBe(
      'Token budget of 900 reached',
    );
    expect(budgetReason({ kind: 'deadline', limit: 60000, used: 61000 })).toBe(
      'Deadline of 60000ms exceeded',
    );
  });
});

describe('budgetLeft', () => {
  test('shows the remainder of every limit', () => {
    expect(budgetLeft(stateOf({ budget: { maxSteps: 10, maxTokens: 1000 } }), 2000)).toEqual({
      stepsLeft: 6,
      stepsTotal: 10,
      tokensLeft: 880,
      tokensTotal: 1000,
    });
  });

  test('shows the remainder against the effective limit', () => {
    expect(
      budgetLeft(stateOf({ budget: { maxSteps: 10 }, extend: { steps: 5 } }), 2000),
    ).toMatchObject({
      stepsLeft: 11,
      stepsTotal: 15,
    });
  });

  test('warns when the run is close to the limit', () => {
    const warn = { maxSteps: 10, warnAtSteps: 3 };
    expect(budgetLeft(stateOf({ budget: warn, steps: 8 }), 2000)?.warn).toBe('soon');
    expect(budgetLeft(stateOf({ budget: warn, steps: 9 }), 2000)?.warn).toBe('last');
    expect(budgetLeft(stateOf({ budget: warn, steps: 5 }), 2000)?.warn).toBeUndefined();
  });

  test('warnAtSteps 0 disables the warning', () => {
    expect(
      budgetLeft(stateOf({ budget: { maxSteps: 10, warnAtSteps: 0 }, steps: 10 }), 2000)?.warn,
    ).toBeUndefined();
  });

  test('no limits means no note', () => {
    expect(budgetLeft(stateOf({}), 2000)).toBeUndefined();
  });
});

describe('defaultExtension', () => {
  test('is a quarter of the base limit', () => {
    expect(defaultExtension(stateOf({ budget: { maxSteps: 40 } }), 'steps')).toBe(10);
    expect(defaultExtension(stateOf({ budget: { maxTokens: 1000 } }), 'tokens')).toBe(250);
    expect(defaultExtension(stateOf({ budget: { deadlineMs: 60000 } }), 'deadline')).toBe(15000);
  });

  test('never drops below one', () => {
    expect(defaultExtension(stateOf({ budget: { maxSteps: 2 } }), 'steps')).toBe(1);
    expect(defaultExtension(stateOf({ budget: {} }), 'steps')).toBe(1);
  });

  test('respects the agent percent knob', () => {
    expect(
      defaultExtension(stateOf({ budget: { maxSteps: 40, extendDefaultPct: 50 } }), 'steps'),
    ).toBe(20);
  });
});

describe('extendState', () => {
  test('accumulates per dimension', () => {
    const once = extendState(stateOf({}), 'steps', 5, 2000);
    expect(once.extend).toEqual({ steps: 5 });
    expect(extendState(once, 'steps', 3, 2000).extend).toEqual({ steps: 8 });
    expect(extendState(once, 'tokens', 3, 2000).extend).toEqual({ steps: 5, tokens: 3 });
  });

  test('an expired deadline moves out from now', () => {
    const state = stateOf({ budget: { deadlineMs: 500 } });
    const next = extendState(state, 'deadline', 1000, 2000);
    expect(next.deadlineAt).toBe(3000);
  });

  test('a future deadline keeps its base and grows', () => {
    const state = stateOf({ budget: { deadlineMs: 60000 } });
    const next = extendState(state, 'deadline', 1000, 2000);
    expect(next.deadlineAt).toBe(62000);
  });
});

describe('budgetInterruptId', () => {
  test('differs per stop of the same run', () => {
    expect(budgetInterruptId('run-1', 'think', 1)).toBe('budget/run-1/think/1');
    expect(budgetInterruptId('run-1', 'think', 2)).toBe('budget/run-1/think/2');
  });
});

describe('budgetLimitOf', () => {
  test('reads the effective limit of a kind', () => {
    const state = stateOf({
      budget: { maxSteps: 10, maxTokens: 100, deadlineMs: 500 },
      extend: { steps: 5 },
    });
    expect(budgetLimitOf(state, 'steps')).toBe(15);
    expect(budgetLimitOf(state, 'tokens')).toBe(100);
    expect(budgetLimitOf(state, 'deadline')).toBe(500);
    expect(budgetLimitOf(stateOf({}), 'steps')).toBeUndefined();
  });
});

describe('budgetUsedOf', () => {
  test('reads the usage of a kind', () => {
    const state = stateOf({});
    expect(budgetUsedOf(state, 'steps', 2000)).toBe(4);
    expect(budgetUsedOf(state, 'tokens', 2000)).toBe(120);
    expect(budgetUsedOf(state, 'deadline', 2000)).toBe(1000);
  });
});
