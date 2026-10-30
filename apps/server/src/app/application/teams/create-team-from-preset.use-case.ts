import { Injectable } from '@harnesys/brix';
import type {
  AgentPresetBody,
  AgentPublic,
  BoardRuleInput,
  CreateAgentBody,
  CreateTeamBody,
  CreateTeamResponse,
  PresetRuleAction,
  RuleAction,
  TeamPresetBody,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { validateStatuses } from '../../domain/issue/board-validation.ts';
import { PresetNotFoundException } from '../../domain/presets/preset.error.ts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import { LlmModelPort } from '../../domain/provider/llm-provider.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { TeamValidationException } from '../../domain/teams/team.error.ts';
import { rolePresetContract } from '../../infra/agent/role-preset-contract.ts';
import { uniqueAgentName } from '../agents/agent.helpers.ts';
import { CreateAgentUseCase } from '../agents/create-agent.use-case.ts';
import { DEFAULT_REACT_BUDGET } from '../agents/react-preset.ts';
import { CreateIssueBoardUseCase } from '../issues/create-issue-board.use-case.ts';
import { SaveBoardRuleUseCase } from '../issues/save-board-rule.use-case.ts';
import { CreateScheduleUseCase } from '../schedules/create-schedule.use-case.ts';
import { isValidCron } from '../schedules/cron-next.ts';
import {
  composeTeamPlan,
  type TeamPlan,
  type TeamPlanAgent,
  type TeamPlanSchedule,
} from './compose-team-plan.ts';

const STUB_MODEL_ID = 'stub';

export interface CreateTeamFromPresetRequest {
  orgId: string;
  actorUserId?: string | null;
  body: CreateTeamBody;
}

@Injectable()
export class CreateTeamFromPresetUseCase {
  constructor(
    private readonly catalog: PresetCatalogPort,
    private readonly agents: AgentRegistryPort,
    private readonly models: LlmModelPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly createAgent: CreateAgentUseCase,
    private readonly createBoard: CreateIssueBoardUseCase,
    private readonly saveBoardRule: SaveBoardRuleUseCase,
    private readonly createSchedule: CreateScheduleUseCase,
    private readonly orgSettings: OrgSettingsPort,
  ) {}

  execute(request: CreateTeamFromPresetRequest): CreateTeamResponse {
    const detail = this.catalog.get('team', request.body.presetId);
    if (detail?.kind !== 'team') {
      throw new PresetNotFoundException(request.body.presetId);
    }
    const preset = detail.body;
    this.assertBoard(preset);
    const agentBodies = this.loadAgentBodies(preset);
    this.assertModels(request.orgId, preset, request.body.models);
    const digestCron = request.body.digestCron?.trim() || null;
    const timezone = this.orgSettings.get(request.orgId).timezone;
    if (digestCron !== null && !isValidCron(digestCron, timezone)) {
      throw new TeamValidationException(`invalid digest cron: ${digestCron}`);
    }
    const plan = composeTeamPlan({
      preset,
      name: request.body.name?.trim() || detail.name,
      models: request.body.models,
      digestCron,
    });
    return this.createTeam(request, plan, agentBodies);
  }

  private createTeam(
    request: CreateTeamFromPresetRequest,
    plan: TeamPlan,
    agentBodies: Map<string, AgentPresetBody>,
  ): CreateTeamResponse {
    const createdAgents: AgentPublic[] = [];
    const agentIdByRoleKey = new Map<string, string>();
    let boardId: string | null = null;
    try {
      for (const planAgent of plan.agents) {
        const agentBody = agentBodies.get(planAgent.roleKey);
        if (!agentBody) {
          throw new TeamValidationException(`preset is missing for role ${planAgent.roleKey}`);
        }
        const agent = this.createAgent.execute({
          orgId: request.orgId,
          body: this.buildBody(request.orgId, planAgent, agentBody),
        });
        createdAgents.push(agent);
        agentIdByRoleKey.set(planAgent.roleKey, agent.id);
      }
      boardId = this.createBoardWithRules(request, plan, agentIdByRoleKey);
      const scheduleId = plan.schedule
        ? this.createDigestSchedule(request, plan.schedule, agentIdByRoleKey)
        : null;
      return { agents: createdAgents, boardId, scheduleId };
    } catch (err) {
      this.rollback(request.orgId, boardId, createdAgents);
      throw err;
    }
  }

  private createBoardWithRules(
    request: CreateTeamFromPresetRequest,
    plan: TeamPlan,
    agentIdByRoleKey: Map<string, string>,
  ): string {
    const board = this.createBoard.execute({
      orgId: request.orgId,
      body: {
        name: plan.board.name,
        statuses: plan.board.statuses,
        ...(plan.board.description !== undefined ? { description: plan.board.description } : {}),
        ...(plan.board.icon !== undefined ? { icon: plan.board.icon } : {}),
        ...(plan.board.color !== undefined ? { color: plan.board.color } : {}),
      },
    });
    for (const rule of this.ruleInputs(plan, agentIdByRoleKey)) {
      this.saveBoardRule.execute({
        orgId: request.orgId,
        boardId: board.board.id,
        actorUserId: request.actorUserId ?? null,
        input: rule,
      });
    }
    return board.board.id;
  }

  private assertBoard(preset: TeamPresetBody): void {
    const issues = validateStatuses(preset.board.statuses);
    if (issues.length > 0) {
      throw new TeamValidationException(
        `invalid board statuses: ${issues.map((issue) => issue.code).join(', ')}`,
      );
    }
  }

  private loadAgentBodies(preset: TeamPresetBody): Map<string, AgentPresetBody> {
    const byRoleKey = new Map<string, AgentPresetBody>();
    for (const role of preset.roles) {
      const detail = this.catalog.get('agent', role.agentRef);
      if (detail?.kind !== 'agent') {
        throw new TeamValidationException(
          `unknown agent preset ${role.agentRef} for role ${role.roleKey}`,
        );
      }
      const violations = rolePresetContract(role.agentRef, detail.body);
      if (violations.length > 0) {
        throw new TeamValidationException(
          `preset ${role.agentRef} violates role contract: ${violations.join('; ')}`,
        );
      }
      byRoleKey.set(role.roleKey, detail.body);
    }
    return byRoleKey;
  }

  private assertModels(
    orgId: string,
    preset: TeamPresetBody,
    models: Record<string, string>,
  ): void {
    for (const role of preset.roles) {
      const modelId = models[role.roleKey]?.trim();
      if (!modelId) {
        if (!role.requiresModel) {
          continue;
        }
        throw new TeamValidationException(`model is required for role ${role.roleKey}`);
      }
      if (modelId === STUB_MODEL_ID) {
        throw new TeamValidationException(
          `role ${role.roleKey} requires a real model, got "${STUB_MODEL_ID}"`,
        );
      }
      if (!this.models.findById(orgId, modelId)) {
        throw new TeamValidationException(`unknown model for role ${role.roleKey}: ${modelId}`);
      }
    }
  }

  private buildBody(
    orgId: string,
    planAgent: TeamPlanAgent,
    preset: AgentPresetBody,
  ): CreateAgentBody {
    return {
      name: uniqueAgentName(this.agents, orgId, planAgent.body.name),
      role: preset.role,
      instructions: preset.instructions,
      modelId: planAgent.body.modelId,
      budgetUsdDaily: planAgent.body.budgetUsdDaily,
      level: 'top',
      skills: preset.skills ?? [],
      mcpServers: preset.mcpServers ?? [],
      config: {
        ...(preset.graph !== undefined ? { graphJson: preset.graph } : {}),
        budgetJson: preset.budget ?? DEFAULT_REACT_BUDGET,
        capabilitiesJson: withCapabilitiesExtra(preset.capabilities, planAgent.capabilitiesExtra),
        ...(preset.permissions !== undefined ? { permissionsJson: preset.permissions } : {}),
        ...(preset.color !== undefined ? { color: preset.color } : {}),
      },
    };
  }

  private ruleInputs(plan: TeamPlan, agentIdByRoleKey: Map<string, string>): BoardRuleInput[] {
    return plan.rules.map((rule, position) => ({
      trigger: rule.trigger,
      conditions: rule.conditions,
      actions: rule.actions.map((action) => this.toRuleAction(action, agentIdByRoleKey)),
      position: rule.position ?? position,
      enabled: rule.enabled,
    }));
  }

  private toRuleAction(
    action: PresetRuleAction,
    agentIdByRoleKey: Map<string, string>,
  ): RuleAction {
    if (action.type !== 'assign_agent') {
      return action;
    }
    const agentId = agentIdByRoleKey.get(action.roleKey);
    if (!agentId) {
      throw new TeamValidationException(`rule references unknown role ${action.roleKey}`);
    }
    return {
      type: 'assign_agent',
      agentId,
      ...(action.executionProfileId !== undefined
        ? { executionProfileId: action.executionProfileId }
        : {}),
    };
  }

  private createDigestSchedule(
    request: CreateTeamFromPresetRequest,
    plan: TeamPlanSchedule,
    agentIdByRoleKey: Map<string, string>,
  ): string {
    const targetAgentId = agentIdByRoleKey.get(plan.agentRoleKey);
    if (!targetAgentId) {
      throw new TeamValidationException(`digest references unknown role ${plan.agentRoleKey}`);
    }
    const created = this.createSchedule.execute({
      orgId: request.orgId,
      actorUserId: request.actorUserId ?? null,
      body: {
        name: plan.name,
        targetAgentId,
        detail: plan.detail,
        cron: plan.cron,
        missPolicy: 'catch-up',
      },
    });
    return created.schedule.id;
  }

  private rollback(orgId: string, boardId: string | null, createdAgents: AgentPublic[]): void {
    if (boardId !== null) {
      this.boards.delete(orgId, boardId);
    }
    for (const agent of createdAgents) {
      this.agents.delete(orgId, agent.id);
    }
  }
}

function withCapabilitiesExtra(
  capabilities: Record<string, Record<string, unknown> | null> | undefined,
  extras: string[],
): Record<string, Record<string, unknown> | null> {
  const merged: Record<string, Record<string, unknown> | null> = { ...capabilities };
  for (const extra of extras) {
    merged[extra] = {};
  }
  return merged;
}
