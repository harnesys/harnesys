import { describe, expect, test } from 'bun:test';
import { BOARD_TEMPLATES } from '@harnesys/contracts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { PresetNotFoundException } from '../../domain/presets/preset.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { TeamValidationException } from '../../domain/teams/team.error.ts';
import { CreateAgentUseCase } from '../agents/create-agent.use-case.ts';
import { CreateIssueBoardUseCase } from '../issues/create-issue-board.use-case.ts';
import { SaveBoardRuleUseCase } from '../issues/save-board-rule.use-case.ts';
import {
  agentDetail,
  CODER_BODY,
  LEAD_BODY,
  REVIEWER_BODY,
  TEAM_BODY,
  teamDetail,
} from './create-team-from-preset.fixtures.ts';
import {
  FakeAgents,
  FakeModels,
  FakeModePresets,
  FakePresetCatalog,
  FakeProfiles,
} from './create-team-from-preset.use-case.fakes.ts';
import { CreateTeamFromPresetUseCase } from './create-team-from-preset.use-case.ts';
import {
  FakeBoards,
  FakeEvents,
  FakeLabels,
} from './create-team-from-preset.use-case.work-fakes.ts';

const ORG_ID = crypto.randomUUID();

const BODY = {
  presetId: 'harnesys/dev-team',
  name: 'Alpha Team',
  models: { lead: 'model-a', coder: 'model-b', reviewer: 'model-a' },
};

interface Harness {
  useCase: CreateTeamFromPresetUseCase;
  agents: FakeAgents;
  boards: FakeBoards;
  catalog: FakePresetCatalog;
}

function defaultCatalog(): FakePresetCatalog {
  const catalog = new FakePresetCatalog();
  catalog.items.set('harnesys/lead', agentDetail('harnesys/lead', LEAD_BODY));
  catalog.items.set('harnesys/coder', agentDetail('harnesys/coder', CODER_BODY));
  catalog.items.set('harnesys/reviewer', agentDetail('harnesys/reviewer', REVIEWER_BODY));
  catalog.items.set('harnesys/dev-team', teamDetail('harnesys/dev-team', TEAM_BODY));
  return catalog;
}

function buildHarness(options?: {
  models?: string[];
  failBoardInsert?: boolean;
  catalog?: FakePresetCatalog;
}): Harness {
  const agents = new FakeAgents();
  const profiles = new FakeProfiles();
  const models = new FakeModels(options?.models ?? ['model-a', 'model-b']);
  const boards = new FakeBoards();
  boards.failInsert = options?.failBoardInsert ?? false;
  const catalog = options?.catalog ?? defaultCatalog();
  const useCase = new CreateTeamFromPresetUseCase(
    catalog,
    agents,
    models,
    boards,
    new CreateAgentUseCase(
      agents,
      stubDepartments(),
      new FakeModePresets(),
      profiles,
      stubSources(),
      stubLayout(),
      stubMachineConfig(),
    ),
    new CreateIssueBoardUseCase(boards, new FakeEvents()),
    new SaveBoardRuleUseCase(boards, new FakeLabels(), agents, profiles, new FakeEvents()),
  );
  return { useCase, agents, boards, catalog };
}

function stubSources(): SourceRegistryPort {
  const port: Pick<SourceRegistryPort, 'findById'> = { findById: () => null };
  return port as SourceRegistryPort;
}

function stubDepartments(): DepartmentRegistryPort {
  const port: Pick<DepartmentRegistryPort, 'findById'> = { findById: () => undefined };
  return port as DepartmentRegistryPort;
}

function stubLayout(): HostFsLayoutPort {
  const port: Pick<HostFsLayoutPort, 'orgDataDir' | 'orgDir'> = {
    orgDataDir: (orgId) => `/data/orgs/${orgId}`,
    orgDir: (orgId) => `/orgs/${orgId}`,
  };
  return port as HostFsLayoutPort;
}

function stubMachineConfig(): MachineConfigPort {
  return new StubMachineConfig();
}

class StubMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'host-1', name: 'host', listen: '127.0.0.1:0', token: 'token' };
  }
  set(_host: HostConfig): void {}
}

function withTeamBody(catalog: FakePresetCatalog, body: typeof TEAM_BODY): void {
  catalog.items.set('harnesys/dev-team', teamDetail('harnesys/dev-team', body));
}

describe('CreateTeamFromPresetUseCase', () => {
  test('creates agents and board with rules', () => {
    const h = buildHarness();
    const response = h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } });
    expect(response.agents).toHaveLength(3);
    const lead = response.agents.find((agent) => agent.name === 'Lead');
    const coder = response.agents.find((agent) => agent.name === 'Coder');
    const reviewer = response.agents.find((agent) => agent.name === 'Reviewer');
    if (!lead || !coder || !reviewer) {
      throw new Error('agents not created');
    }
    expect(lead.role).toBe('manager');
    expect(lead.config?.capabilitiesJson).toMatchObject({ manager: {} });
    expect(lead.budgetUsdDaily).toBe(5);
    expect(coder.modelId).toBe('model-b');
    expect(coder.budgetUsdDaily).toBe(10);
    expect(reviewer.budgetUsdDaily).toBe(5);
    const board = h.boards.listByOrg(ORG_ID)[0];
    if (!board) {
      throw new Error('board not created');
    }
    expect(response.boardId).toBe(board.id);
    expect(board.statuses).toHaveLength(BOARD_TEMPLATES.dev.statuses.length);
    const boardRules = h.boards.rules.get(response.boardId) ?? [];
    expect(boardRules).toHaveLength(2);
    expect(boardRules[0]).toMatchObject({
      trigger: { type: 'status_entered', statusKey: 'in_progress' },
      actions: [{ type: 'assign_agent', agentId: coder.id }],
      position: 0,
    });
    expect(boardRules[1]).toMatchObject({
      trigger: { type: 'status_entered', statusKey: 'in_review' },
      actions: [{ type: 'assign_agent', agentId: reviewer.id }],
      position: 1,
    });
  });

  test('rejects unknown model without creating anything', () => {
    const h = buildHarness();
    const body = { ...BODY, models: { ...BODY.models, coder: 'missing-model' } };
    expect(() => h.useCase.execute({ orgId: ORG_ID, body })).toThrow(TeamValidationException);
    expect(h.agents.items.size).toBe(0);
    expect(h.boards.items.size).toBe(0);
  });

  test('rejects stub model', () => {
    const h = buildHarness();
    const body = { ...BODY, models: { ...BODY.models, reviewer: 'stub' } };
    expect(() => h.useCase.execute({ orgId: ORG_ID, body })).toThrow(TeamValidationException);
    expect(h.agents.items.size).toBe(0);
  });

  test('creates model-less agent for role with requiresModel false', () => {
    const catalog = defaultCatalog();
    withTeamBody(catalog, {
      ...TEAM_BODY,
      roles: TEAM_BODY.roles.map((role) =>
        role.roleKey === 'reviewer' ? { ...role, requiresModel: false } : role,
      ),
    });
    const h = buildHarness({ catalog });
    const response = h.useCase.execute({
      orgId: ORG_ID,
      body: { ...BODY, models: { lead: 'model-a', coder: 'model-b' } },
    });
    const reviewer = response.agents.find((agent) => agent.name === 'Reviewer');
    expect(reviewer?.modelId).toBe('stub');
    expect(h.agents.items.size).toBe(3);
  });

  test('rolls back created agents and board when board creation fails', () => {
    const h = buildHarness({ failBoardInsert: true });
    expect(() => h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } })).toThrow(
      'board insert failed',
    );
    expect(h.agents.items.size).toBe(0);
    expect(h.boards.items.size).toBe(0);
    expect(h.boards.rules.size).toBe(0);
  });

  test('re-creating the same preset does not conflict on names', () => {
    const h = buildHarness();
    h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } });
    const second = h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } });
    expect(second.agents.map((agent) => agent.name)).toEqual(['Lead 2', 'Coder 2', 'Reviewer 2']);
    expect(h.agents.list(ORG_ID)).toHaveLength(6);
  });

  test('rejects a preset that violates the role contract', () => {
    const catalog = defaultCatalog();
    catalog.items.set(
      'harnesys/coder',
      agentDetail('harnesys/coder', { ...CODER_BODY, budget: { maxSteps: 999 } }),
    );
    const h = buildHarness({ catalog });
    expect(() => h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } })).toThrow(
      TeamValidationException,
    );
    expect(h.agents.items.size).toBe(0);
    expect(h.boards.items.size).toBe(0);
  });

  test('rejects unknown team preset', () => {
    const h = buildHarness();
    expect(() =>
      h.useCase.execute({ orgId: ORG_ID, body: { ...BODY, presetId: 'local/nope' } }),
    ).toThrow(PresetNotFoundException);
  });

  test('rejects unknown agent preset reference', () => {
    const catalog = defaultCatalog();
    withTeamBody(catalog, {
      ...TEAM_BODY,
      roles: TEAM_BODY.roles.map((role) =>
        role.roleKey === 'coder' ? { ...role, agentRef: 'local/ghost' } : role,
      ),
    });
    const h = buildHarness({ catalog });
    expect(() => h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } })).toThrow(
      /unknown agent preset local\/ghost for role coder/,
    );
    expect(h.agents.items.size).toBe(0);
  });

  test('rejects a rule referencing an unknown role', () => {
    const catalog = defaultCatalog();
    withTeamBody(catalog, {
      ...TEAM_BODY,
      board: {
        ...TEAM_BODY.board,
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
    });
    const h = buildHarness({ catalog });
    expect(() => h.useCase.execute({ orgId: ORG_ID, body: { ...BODY } })).toThrow(
      TeamValidationException,
    );
    expect(h.agents.items.size).toBe(0);
  });
});
