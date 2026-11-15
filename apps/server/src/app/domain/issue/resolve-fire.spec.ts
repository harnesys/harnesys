import { describe, expect, test } from 'bun:test';
import type { BoardRuleRecord } from './board.ts';
import { pickAssignment } from './pick-assignment.ts';
import { resolveFire } from './resolve-fire.ts';
import type { EngineIssue, EngineRefs } from './rule-engine.ts';

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

function issue(partial: Partial<EngineIssue> = {}): EngineIssue {
  return {
    statusKey: 'in_progress',
    labels: [],
    priority: 3,
    type: 'task',
    hasOpenBlockers: false,
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
  issue: issue({ labels: ['frontend'] }),
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

  test('specific labeled rule fires before the generic fallback', () => {
    const resolved = resolveFire({
      ...base,
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(resolved.agentId).toBe('lena');
    expect(resolved.ruleId).toBe('r1');
  });

  test('falls back to label-less rule when no label matches', () => {
    const resolved = resolveFire({
      ...base,
      issue: issue({ labels: [] }),
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(resolved.agentId).toBe('guard');
    expect(resolved.ownerUserId).toBeNull();
  });

  test('no matching rule means no agent', () => {
    const resolved = resolveFire({
      ...base,
      issue: issue({ statusKey: 'todo', labels: [] }),
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
      issue: issue({ labels: ['frontend'] }),
      event: { type: 'status_entered', statusKey: 'in_review' },
    });
    expect(first.agentId).toBe('lena');
    expect(second.agentId).toBe('lena');
  });

  test('pickAssignment picks the first assign by position and first owner', () => {
    const labeled = pickAssignment({
      rules: base.rules,
      issue: issue({ statusKey: 'in_review', labels: ['frontend'] }),
      refs,
    });
    expect(labeled).toEqual({
      agentId: 'lena',
      executionProfileId: null,
      ruleId: 'r1',
      ownerUserId: 'mira',
    });
    const generic = pickAssignment({
      rules: base.rules,
      issue: issue({ statusKey: 'in_review', labels: [] }),
      refs,
    });
    expect(generic?.agentId).toBe('guard');
    const none = pickAssignment({
      rules: base.rules,
      issue: issue({ statusKey: 'todo' }),
      refs,
    });
    expect(none).toBeNull();
  });
});
