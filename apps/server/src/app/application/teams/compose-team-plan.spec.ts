import { describe, expect, test } from 'bun:test';
import type { TeamPresetBody } from '@harnesys/contracts';
import { TeamValidationException } from '../../domain/teams/team.error.ts';
import { composeTeamPlan } from './compose-team-plan.ts';

const PRESET: TeamPresetBody = {
  roles: [
    {
      roleKey: 'jarvis',
      name: 'Jarvis',
      agentRef: 'harnesys/jarvis',
      budgetUsdDaily: 5,
      requiresModel: true,
      capabilitiesExtra: ['manager'],
    },
    {
      roleKey: 'coder',
      name: 'Coder',
      agentRef: 'harnesys/coder',
      budgetUsdDaily: 10,
      requiresModel: true,
    },
    {
      roleKey: 'reviewer',
      name: 'Reviewer',
      agentRef: 'harnesys/reviewer',
      budgetUsdDaily: 5,
      requiresModel: true,
    },
  ],
  board: {
    name: 'Product Dev',
    statuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0, isEntry: true },
      { key: 'in_progress', label: 'In progress', category: 'started', order: 1, isEntry: false },
      { key: 'done', label: 'Done', category: 'finished', order: 2, isEntry: false },
    ],
    rules: [
      {
        trigger: { type: 'status_entered', statusKey: 'in_progress' },
        conditions: [],
        actions: [{ type: 'assign_agent', roleKey: 'coder' }],
        position: 0,
        enabled: true,
      },
      {
        trigger: { type: 'status_entered', statusKey: 'done' },
        conditions: [],
        actions: [{ type: 'assign_agent', roleKey: 'reviewer' }],
        position: 1,
        enabled: true,
      },
    ],
  },
  digest: { cronDefault: '0 9 * * *', roleKey: 'jarvis', detail: 'Daily digest.' },
};

const MODELS: Record<string, string> = {
  jarvis: 'model-a',
  coder: 'model-b',
  reviewer: 'model-a',
};

function compose(digestCron: string | null) {
  return composeTeamPlan({
    preset: PRESET,
    name: 'Alpha Team',
    models: MODELS,
    digestCron,
  });
}

describe('composeTeamPlan', () => {
  test('composes one agent per role with model and top level', () => {
    const plan = compose(null);
    expect(plan.agents).toHaveLength(3);
    expect(plan.agents.map((agent) => agent.roleKey)).toEqual(['jarvis', 'coder', 'reviewer']);
    const jarvis = plan.agents.find((agent) => agent.roleKey === 'jarvis');
    expect(jarvis?.body).toMatchObject({
      name: 'Jarvis',
      modelId: 'model-a',
      level: 'top',
    });
    expect(jarvis?.capabilitiesExtra).toEqual(['manager']);
    expect(plan.agents.map((agent) => agent.body.budgetUsdDaily)).toEqual([5, 10, 5]);
    const coder = plan.agents.find((agent) => agent.roleKey === 'coder');
    expect(coder?.body).toMatchObject({ name: 'Coder', modelId: 'model-b' });
  });

  test('plan carries no top-level source id', () => {
    const plan = compose(null);
    expect(Object.keys(plan)).not.toContain('sourceId');
    expect(plan.agents.every((agent) => !('sourceId' in agent.body))).toBe(true);
  });

  test('board keeps the preset statuses', () => {
    const plan = compose(null);
    expect(plan.board.name).toBe('Product Dev');
    expect(plan.board.statuses).toHaveLength(3);
    expect(plan.board.statuses[0]?.key).toBe('backlog');
  });

  test('rules keep the preset role keys', () => {
    const plan = compose(null);
    expect(plan.rules).toHaveLength(2);
    expect(plan.rules[0]?.actions).toEqual([{ type: 'assign_agent', roleKey: 'coder' }]);
  });

  test('schedule is null without digestCron', () => {
    const plan = compose(null);
    expect(plan.schedule).toBeNull();
  });

  test('schedule binds digest to the preset digest role with cron and detail', () => {
    const plan = compose('30 8 * * 1-5');
    expect(plan.schedule).toEqual({
      agentRoleKey: 'jarvis',
      name: 'Alpha Team',
      cron: '30 8 * * 1-5',
      detail: 'Daily digest.',
    });
  });

  test('rejects missing model for a role', () => {
    expect(() =>
      composeTeamPlan({
        preset: PRESET,
        name: 'Alpha Team',
        models: { jarvis: 'model-a', coder: 'model-b' },
        digestCron: null,
      }),
    ).toThrow(TeamValidationException);
  });

  test('optional-model role without a pick falls back to stub model', () => {
    const optionalReviewer: TeamPresetBody = {
      ...PRESET,
      roles: PRESET.roles.map((role) =>
        role.roleKey === 'reviewer' ? { ...role, requiresModel: false } : role,
      ),
    };
    const plan = composeTeamPlan({
      preset: optionalReviewer,
      name: 'Alpha Team',
      models: { jarvis: 'model-a', coder: 'model-b' },
      digestCron: null,
    });
    const reviewer = plan.agents.find((agent) => agent.roleKey === 'reviewer');
    expect(reviewer?.body.modelId).toBe('stub');
  });

  test('rejects rule referencing unknown role', () => {
    const broken: TeamPresetBody = {
      ...PRESET,
      board: {
        ...PRESET.board,
        rules: [
          {
            trigger: { type: 'status_entered', statusKey: 'in_progress' },
            conditions: [],
            actions: [{ type: 'assign_agent', roleKey: 'ghost' }],
            position: 0,
            enabled: true,
          },
        ],
      },
    };
    expect(() =>
      composeTeamPlan({
        preset: broken,
        name: 'Alpha Team',
        models: MODELS,
        digestCron: null,
      }),
    ).toThrow(TeamValidationException);
  });

  test('digest schedule binds to the preset digest role', () => {
    const shifted: TeamPresetBody = {
      ...PRESET,
      digest: { ...PRESET.digest, roleKey: 'reviewer' },
    };
    const plan = composeTeamPlan({
      preset: shifted,
      name: 'Alpha Team',
      models: MODELS,
      digestCron: '30 8 * * 1-5',
    });
    expect(plan.schedule?.agentRoleKey).toBe('reviewer');
  });

  test('rejects digest role referencing unknown role', () => {
    const broken: TeamPresetBody = {
      ...PRESET,
      digest: { ...PRESET.digest, roleKey: 'ghost' },
    };
    expect(() =>
      composeTeamPlan({
        preset: broken,
        name: 'Alpha Team',
        models: MODELS,
        digestCron: '30 8 * * 1-5',
      }),
    ).toThrow(TeamValidationException);
  });
});
