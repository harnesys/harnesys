import { describe, expect, test } from 'bun:test';
import type { TeamPresetBody } from '@harnesys/contracts';
import { TeamValidationException } from '../../domain/teams/team.error.ts';
import { composeTeamPlan } from './compose-team-plan.ts';

const PRESET: TeamPresetBody = {
  roles: [
    {
      roleKey: 'lead',
      name: 'Lead',
      agentRef: 'harnesys/lead',
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
    name: 'Dev Team',
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
  digest: { cronDefault: '0 9 * * *', roleKey: 'lead', detail: 'Daily digest.' },
};

const MODELS: Record<string, string> = {
  lead: 'model-a',
  coder: 'model-b',
  reviewer: 'model-a',
};

function compose() {
  return composeTeamPlan({
    preset: PRESET,
    name: 'Alpha Team',
    models: MODELS,
  });
}

describe('composeTeamPlan', () => {
  test('composes one agent per role with model and top level', () => {
    const plan = compose();
    expect(plan.agents).toHaveLength(3);
    expect(plan.agents.map((agent) => agent.roleKey)).toEqual(['lead', 'coder', 'reviewer']);
    const lead = plan.agents.find((agent) => agent.roleKey === 'lead');
    expect(lead?.body).toMatchObject({
      name: 'Lead',
      modelId: 'model-a',
      level: 'top',
    });
    expect(lead?.capabilitiesExtra).toEqual(['manager']);
    expect(plan.agents.map((agent) => agent.body.budgetUsdDaily)).toEqual([5, 10, 5]);
    const coder = plan.agents.find((agent) => agent.roleKey === 'coder');
    expect(coder?.body).toMatchObject({ name: 'Coder', modelId: 'model-b' });
  });

  test('plan carries no top-level source id', () => {
    const plan = compose();
    expect(Object.keys(plan)).not.toContain('sourceId');
    expect(plan.agents.every((agent) => !('sourceId' in agent.body))).toBe(true);
  });

  test('board keeps the preset statuses', () => {
    const plan = compose();
    expect(plan.board.name).toBe('Dev Team');
    expect(plan.board.statuses).toHaveLength(3);
    expect(plan.board.statuses[0]?.key).toBe('backlog');
  });

  test('rules keep the preset role keys', () => {
    const plan = compose();
    expect(plan.rules).toHaveLength(2);
    expect(plan.rules[0]?.actions).toEqual([{ type: 'assign_agent', roleKey: 'coder' }]);
  });

  test('rejects missing model for a role', () => {
    expect(() =>
      composeTeamPlan({
        preset: PRESET,
        name: 'Alpha Team',
        models: { lead: 'model-a', coder: 'model-b' },
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
      models: { lead: 'model-a', coder: 'model-b' },
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
      }),
    ).toThrow(TeamValidationException);
  });
});
