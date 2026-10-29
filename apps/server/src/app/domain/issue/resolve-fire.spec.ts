import { describe, expect, test } from 'bun:test';
import type { BoardRuleRecord } from './board.ts';
import { resolveFire } from './resolve-fire.ts';
import type { EngineRefs } from './rule-engine.ts';
import { pickAssignment } from './rule-engine.ts';

function rule(partial: Partial<BoardRuleRecord> & { id: string }): BoardRuleRecord {
  return {
    trigger: { type: 'status_entered', statusKey: 'in_review' },
    conditions: [],
    actions: [{ type: 'assign_agent', agentId: 'lena' }],
    position: 0,
    enabled: true,
    createdByUserId: null,
    ...partial,
  };
}

const refs: EngineRefs = {
  statusExists: (key) => ['todo', 'in_progress', 'in_review', 'done'].includes(key),
  labelExists: (id) => ['frontend'].includes(id),
  agentExists: (id) => ['lena', 'guard', 'bob'].includes(id),
};

const base = {
  rules: [
    rule({
      id: 'r1',
      trigger: { type: 'status_entered', statusKey: 'in_review' },
      conditions: [{ type: 'has_label', labelId: 'frontend' }],
      createdByUserId: 'mira',
    }),
    rule({
      id: 'r2',
      trigger: { type: 'status_entered', statusKey: 'in_review' },
      position: 1,
      actions: [{ type: 'assign_agent', agentId: 'guard' }],
    }),
  ],
  issue: { statusKey: 'in_progress', labels: ['frontend'] as string[] },
  refs,
  explicitAssignee: null,
  hasOpenBlockers: false,
};

describe('resolveFire', () => {
  test('fires by matching rule with label condition', () => {
    const resolved = resolveFire({
      ...base,
      rules: [base.rules[0] as BoardRuleRecord],
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(resolved.agentId).toBe('lena');
    expect(resolved.reason).toBe('rule');
    expect(resolved.ownerUserId).toBe('mira');
    expect(resolved.finalStatusKey).toBe('in_review');
  });

  test('falls back to label-less rule when no label matches', () => {
    const resolved = resolveFire({
      ...base,
      issue: { statusKey: 'in_progress', labels: [] },
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(resolved.agentId).toBe('guard');
    expect(resolved.ownerUserId).toBeNull();
  });

  test('no matching rule means no agent', () => {
    const resolved = resolveFire({
      ...base,
      issue: { statusKey: 'todo', labels: [] },
      event: { type: 'status_entered', statusKey: 'todo' },
    });
    expect(resolved.agentId).toBeNull();
  });

  test('explicit assignee wins over rule and suppresses rule assignment', () => {
    const resolved = resolveFire({
      ...base,
      event: { type: 'status_entered', statusKey: 'in_review' },
      explicitAssignee: 'bob',
    });
    expect(resolved.agentId).toBe('bob');
    expect(resolved.reason).toBe('override');
    expect(resolved.ownerUserId).toBeNull();
    expect(resolved.ruleId).toBeNull();
  });

  test('open blockers suppress agent assignment but keep rule outcome', () => {
    const rules = [
      ...base.rules,
      rule({
        id: 'r3',
        trigger: { type: 'status_entered', statusKey: 'in_review' },
        position: 2,
        actions: [{ type: 'set_status', statusKey: 'done' }],
      }),
    ];
    const resolved = resolveFire({
      ...base,
      rules,
      event: { type: 'status_entered', statusKey: 'in_review' },
      hasOpenBlockers: true,
    });
    expect(resolved.agentId).toBeNull();
    expect(resolved.finalStatusKey).toBe('done');
  });

  test('rework: re-entering a started status fires again (no lastFired guard)', () => {
    const rules = [base.rules[0] as BoardRuleRecord];
    const first = resolveFire({
      ...base,
      rules,
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    const second = resolveFire({
      ...base,
      rules,
      issue: { statusKey: 'in_progress', labels: ['frontend'] },
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(first.agentId).toBe('lena');
    expect(second.agentId).toBe('lena');
  });

  test('pickAssignment picks last assign by position and first owner', () => {
    const picked = pickAssignment({
      rules: base.rules,
      issue: { statusKey: 'in_review', labels: [] },
      refs,
    });
    expect(picked).toEqual({
      agentId: 'guard',
      executionProfileId: null,
      ruleId: 'r2',
      ownerUserId: null,
    });
    const none = pickAssignment({
      rules: base.rules,
      issue: { statusKey: 'todo', labels: [] },
      refs,
    });
    expect(none).toBeNull();
  });
});
