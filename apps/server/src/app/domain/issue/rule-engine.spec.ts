import { describe, expect, test } from 'bun:test';
import type { BoardRuleRecord } from './board.ts';
import type { EngineIssue, EngineRefs } from './rule-engine.ts';
import { MAX_CASCADE_TRANSITIONS, runRules } from './rule-engine.ts';

function rule(partial: Partial<BoardRuleRecord> & { id: string }): BoardRuleRecord {
  return {
    trigger: { type: 'status_entered', statusKey: 'a' },
    conditions: [],
    actions: [{ type: 'assign_agent', agentId: 'agent-1' }],
    position: 0,
    enabled: true,
    createdByUserId: null,
    ...partial,
  };
}

function issue(partial: Partial<EngineIssue> = {}): EngineIssue {
  return {
    statusKey: 'a',
    labels: [],
    priority: 3,
    type: 'task',
    hasOpenBlockers: false,
    ...partial,
  };
}

const refs: EngineRefs = {
  statusExists: (key) => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].includes(key),
  labelExists: (id) => id === 'label-frontend' || id === 'label-blocker',
  agentExists: (id) => id === 'agent-1' || id === 'agent-2',
};

describe('runRules', () => {
  test('matches trigger and has_label condition', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r1',
          conditions: [{ type: 'has_label', labelId: 'label-frontend' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue({ labels: ['label-frontend'] }),
      refs,
    });
    expect(outcome.assigns).toHaveLength(1);
    expect(outcome.assigns[0]?.agentId).toBe('agent-1');
    expect(outcome.finalStatusKey).toBe('a');
  });

  test('rule with a foreign label condition does not match', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r1',
          conditions: [{ type: 'has_label', labelId: 'label-backend' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue({ labels: ['label-frontend'] }),
      refs,
    });
    expect(outcome.assigns).toHaveLength(0);
    expect(outcome.skippedRules).toEqual([{ ruleId: 'r1', reason: 'dead-ref' }]);
  });

  test('has_not_label, has_priority, has_type and has_open_blockers conditions gate the rule', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r-gated',
          conditions: [
            { type: 'has_not_label', labelId: 'label-blocker' },
            { type: 'has_priority', priority: 1 },
            { type: 'has_type', issueType: 'bug' },
            { type: 'has_open_blockers', value: false },
          ],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue({ priority: 1, type: 'bug' }),
      refs,
    });
    expect(outcome.assigns).toHaveLength(1);

    const blocked = runRules({
      rules: [
        rule({
          id: 'r-gated',
          conditions: [{ type: 'has_not_label', labelId: 'label-blocker' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue({ labels: ['label-blocker'] }),
      refs,
    });
    expect(blocked.assigns).toHaveLength(0);
  });

  test('cascade set_status chain stops by rule', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r1',
          trigger: { type: 'status_entered', statusKey: 'a' },
          actions: [{ type: 'set_status', statusKey: 'b' }],
        }),
        rule({
          id: 'r2',
          trigger: { type: 'status_entered', statusKey: 'b' },
          position: 1,
          actions: [{ type: 'set_status', statusKey: 'c' }],
        }),
        rule({
          id: 'r3',
          trigger: { type: 'status_entered', statusKey: 'c' },
          position: 2,
          actions: [{ type: 'assign_agent', agentId: 'agent-2' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.finalStatusKey).toBe('c');
    expect(outcome.assigns.map((assign) => assign.agentId)).toEqual(['agent-2']);
  });

  test('ring A→B→A stops on re-entering A, final status B', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'ra',
          trigger: { type: 'status_entered', statusKey: 'a' },
          actions: [{ type: 'set_status', statusKey: 'b' }],
        }),
        rule({
          id: 'rb',
          trigger: { type: 'status_entered', statusKey: 'b' },
          position: 1,
          actions: [{ type: 'set_status', statusKey: 'a' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.finalStatusKey).toBe('b');
  });

  test('cascade cap: a 6-transition chain breaks at the cap', () => {
    const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, 7).map((key, index, keys) =>
      rule({
        id: `r-${key}`,
        trigger: { type: 'status_entered', statusKey: key },
        position: index,
        actions: [{ type: 'set_status', statusKey: keys[index + 1] ?? 'h' }],
      }),
    );
    const outcome = runRules({
      rules: chain,
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.finalStatusKey).toBe('f');
    expect(MAX_CASCADE_TRANSITIONS).toBe(5);
  });

  test('dead-ref condition skips the rule; dead-ref action is dropped but other rules still fire', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r-dead-cond',
          conditions: [{ type: 'has_label', labelId: 'label-ghost' }],
        }),
        rule({
          id: 'r-dead-action',
          position: 1,
          actions: [{ type: 'assign_agent', agentId: 'agent-ghost' }],
        }),
        rule({
          id: 'r-live',
          position: 2,
          actions: [{ type: 'notify_owner', text: 'moved' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.assigns).toHaveLength(0);
    expect(outcome.notifications.map((n) => n.text)).toEqual(['moved']);
    expect(outcome.skippedRules.map((entry) => entry.ruleId).sort()).toEqual([
      'r-dead-action',
      'r-dead-cond',
    ]);
  });

  test('first matching assign_agent wins, later assigns are ignored', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r1',
          actions: [
            { type: 'assign_agent', agentId: 'agent-1', executionProfileId: 'profile-1' },
            { type: 'notify_owner', text: 'first' },
          ],
        }),
        rule({
          id: 'r2',
          position: 1,
          actions: [{ type: 'assign_agent', agentId: 'agent-2' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.assigns.map((assign) => assign.agentId)).toEqual(['agent-1']);
    expect(outcome.notifications.map((n) => n.text)).toEqual(['first']);
  });

  test('unassign wins over a later assign, stop halts further rules', () => {
    const unassigned = runRules({
      rules: [
        rule({ id: 'r-clear', actions: [{ type: 'unassign' }] }),
        rule({
          id: 'r-assign',
          position: 1,
          actions: [{ type: 'assign_agent', agentId: 'agent-1' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(unassigned.assigns).toHaveLength(0);
    expect(unassigned.unassign).toBe(true);

    const stopped = runRules({
      rules: [
        rule({ id: 'r-stop', actions: [{ type: 'stop' }] }),
        rule({
          id: 'r-later',
          position: 1,
          actions: [{ type: 'notify_owner', text: 'should not fire' }],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(stopped.stopped).toBe(true);
    expect(stopped.notifications).toHaveLength(0);
  });

  test('add_label and remove_label collect net label mutations', () => {
    const outcome = runRules({
      rules: [
        rule({
          id: 'r-labels',
          actions: [
            { type: 'add_label', labelId: 'label-frontend' },
            { type: 'remove_label', labelId: 'label-blocker' },
          ],
        }),
      ],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue({ labels: ['label-blocker'] }),
      refs,
    });
    expect(outcome.addLabelIds).toEqual(['label-frontend']);
    expect(outcome.removeLabelIds).toEqual(['label-blocker']);
  });

  test('disabled rules are reported as skipped and never execute', () => {
    const outcome = runRules({
      rules: [rule({ id: 'r-off', enabled: false })],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(outcome.assigns).toHaveLength(0);
    expect(outcome.skippedRules).toEqual([{ ruleId: 'r-off', reason: 'disabled' }]);
  });

  test('issue_created trigger fires on create event only', () => {
    const outcome = runRules({
      rules: [rule({ id: 'r-create', trigger: { type: 'issue_created' } })],
      event: [{ type: 'issue_created' }, { type: 'status_entered', statusKey: 'a' }],
      issue: issue(),
      refs,
    });
    expect(outcome.assigns).toHaveLength(1);
    const noCreate = runRules({
      rules: [rule({ id: 'r-create', trigger: { type: 'issue_created' } })],
      event: { type: 'status_entered', statusKey: 'a' },
      issue: issue(),
      refs,
    });
    expect(noCreate.assigns).toHaveLength(0);
  });
});
