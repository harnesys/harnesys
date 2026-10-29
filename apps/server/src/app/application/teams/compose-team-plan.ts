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

export interface TeamPlanSchedule {
  agentRoleKey: string;
  name: string;
  cron: string;
  detail: string;
}

export interface TeamPlan {
  agents: TeamPlanAgent[];
  board: TeamPlanBoard;
  rules: PresetBoardRule[];
  schedule: TeamPlanSchedule | null;
}

export interface ComposeTeamPlanInput {
  preset: TeamPresetBody;
  name: string;
  models: Record<string, string>;
  digestCron: string | null;
}

export function composeTeamPlan(input: ComposeTeamPlanInput): TeamPlan {
  const roleByKey = new Map(input.preset.roles.map((role) => [role.roleKey, role]));
  return {
    agents: input.preset.roles.map((role) => toPlanAgent(role, input)),
    board: toPlanBoard(input),
    rules: input.preset.board.rules.map((rule) => toPlanRule(rule, roleByKey)),
    schedule: input.digestCron === null ? null : toPlanSchedule(input, roleByKey),
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

function toPlanSchedule(
  input: ComposeTeamPlanInput,
  roleByKey: Map<string, TeamPresetRole>,
): TeamPlanSchedule {
  if (input.digestCron === null) {
    throw new TeamValidationException('digest cron is required for digest schedule');
  }
  const digestRoleKey = input.preset.digest.roleKey;
  if (!roleByKey.has(digestRoleKey)) {
    throw new TeamValidationException(`digest references unknown role ${digestRoleKey}`);
  }
  return {
    agentRoleKey: digestRoleKey,
    name: input.name,
    cron: input.digestCron,
    detail: input.preset.digest.detail,
  };
}
