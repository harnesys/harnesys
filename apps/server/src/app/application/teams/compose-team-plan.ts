import type {
  BoardStatus,
  CreateAgentBody,
  PresetBoardRule,
  TeamPresetBody,
  TeamPresetRole,
} from '@harnesys/contracts';
import { TeamValidationException } from '../../domain/teams/team.error.ts';

const FALLBACK_MODEL_ID = 'stub';

export interface TeamPlanAgent {
  body: CreateAgentBody;
  roleKey: string;
  capabilitiesExtra: string[];
}

export interface TeamPlanBoard {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  statuses: BoardStatus[];
}

export interface TeamPlan {
  agents: TeamPlanAgent[];
  board: TeamPlanBoard;
  rules: PresetBoardRule[];
}

export interface ComposeTeamPlanInput {
  preset: TeamPresetBody;
  name: string;
  models: Record<string, string>;
}

export function composeTeamPlan(input: ComposeTeamPlanInput): TeamPlan {
  const roleByKey = new Map(input.preset.roles.map((role) => [role.roleKey, role]));
  return {
    agents: input.preset.roles.map((role) => toPlanAgent(role, input)),
    board: toPlanBoard(input),
    rules: input.preset.board.rules.map((rule) => toPlanRule(rule, roleByKey)),
  };
}

function toPlanAgent(role: TeamPresetRole, input: ComposeTeamPlanInput): TeamPlanAgent {
  const modelId = input.models[role.roleKey]?.trim();
  if (!modelId && role.requiresModel) {
    throw new TeamValidationException(`model is required for role ${role.roleKey}`);
  }
  return {
    roleKey: role.roleKey,
    capabilitiesExtra: role.capabilitiesExtra ?? [],
    body: {
      name: role.name,
      role: role.roleKey,
      instructions: '',
      modelId: modelId || FALLBACK_MODEL_ID,
      budgetUsdDaily: role.budgetUsdDaily,
      level: 'top',
    },
  };
}

function toPlanBoard(input: ComposeTeamPlanInput): TeamPlanBoard {
  const board = input.preset.board;
  return {
    name: board.name ?? input.name,
    statuses: board.statuses.map((status) => ({ ...status })),
    ...(board.description !== undefined ? { description: board.description } : {}),
    ...(board.icon !== undefined ? { icon: board.icon } : {}),
    ...(board.color !== undefined ? { color: board.color } : {}),
  };
}

function toPlanRule(
  rule: PresetBoardRule,
  roleByKey: Map<string, TeamPresetRole>,
): PresetBoardRule {
  for (const action of rule.actions) {
    if (action.type === 'assign_agent' && !roleByKey.has(action.roleKey)) {
      throw new TeamValidationException(`rule references unknown role ${action.roleKey}`);
    }
  }
  return rule;
}
