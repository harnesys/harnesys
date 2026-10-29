import { Injectable } from '@harnesys/brix';
import type { AgentPublic, UpdateAgentBody } from '@harnesys/contracts';
import {
  AgentConflictException,
  AgentValidationException,
} from '../../domain/agent/agent.error.ts';
import type { AgentPatch } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import {
  requireAgent,
  stripHookConfig,
  toAgentPublic,
  validateDefaultModeId,
  validateExecutionProfileId,
} from './agent.helpers.ts';
import { validateAgentHooks } from './agent-hooks.validation.ts';

export interface UpdateAgentRequest {
  orgId: string;
  agentId: string;
  body: UpdateAgentBody;
}

@Injectable()
export class UpdateAgentUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly modePresets: ModePresetRegistryPort,
    private readonly profiles: ExecutionProfilePort,
  ) {}

  execute(request: UpdateAgentRequest): AgentPublic {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const patch = buildUpdatePatch(this.agents, this.modePresets, this.profiles, request);
    assignHooksPatch(this.agents, request, agent.mcpServers, patch);
    return toAgentPublic(this.agents.update(request.orgId, request.agentId, patch));
  }
}

function assignHooksPatch(
  agents: AgentRegistryPort,
  request: UpdateAgentRequest,
  mcpServers: string[],
  patch: AgentPatch,
): void {
  const body = request.body;
  if (body.hooks !== undefined) {
    const result = validateAgentHooks(body.hooks, {
      agentId: request.agentId,
      mcpServers,
      agentIds: agents.list(request.orgId).map((agent) => agent.id),
    });
    if (!result.ok) {
      throw new AgentValidationException('invalid agent hooks', { issues: result.issues });
    }
    patch.hooks = result.hooks;
  }
  if (body.config !== undefined) {
    patch.config = stripHookConfig(body.config);
  }
}

function buildUpdatePatch(
  agents: AgentRegistryPort,
  modePresets: ModePresetRegistryPort,
  profiles: ExecutionProfilePort,
  request: UpdateAgentRequest,
): AgentPatch {
  const body = request.body;
  const patch: AgentPatch = {};
  assignIdentityPatch({
    agents,
    orgId: request.orgId,
    agentId: request.agentId,
    body,
    patch,
  });
  assignPolicyPatch(body, patch);
  assignCatalogPatch(modePresets, request.orgId, body, patch);
  if (body.executionProfileId !== undefined) {
    patch.executionProfileId = validateExecutionProfileId(
      profiles,
      request.orgId,
      body.executionProfileId,
    );
  }
  return patch;
}

function assignIdentityPatch(input: {
  agents: AgentRegistryPort;
  orgId: string;
  agentId: string;
  body: UpdateAgentBody;
  patch: AgentPatch;
}): void {
  const { agents, orgId, agentId, body, patch } = input;
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      throw new AgentValidationException('agent name cannot be empty');
    }
    const existing = agents.findByName(orgId, name);
    if (existing && existing.id !== agentId) {
      throw new AgentConflictException('agent name taken in org');
    }
    patch.name = name;
  }
  if (body.role !== undefined) {
    patch.role = body.role.trim() || 'Operator';
  }
  if (body.instructions !== undefined) {
    patch.instructions = body.instructions;
  }
  if (body.modelId !== undefined) {
    const modelId = body.modelId.trim();
    if (!modelId) {
      throw new AgentValidationException('modelId cannot be empty');
    }
    patch.modelId = modelId;
  }
}

function assignPolicyPatch(body: UpdateAgentBody, patch: AgentPatch): void {
  if (body.budgetUsdDaily !== undefined) {
    patch.budgetUsdDaily = body.budgetUsdDaily;
  }
  if (body.level !== undefined) {
    patch.level = body.level;
  }
  if (body.parentId !== undefined) {
    patch.parentId = body.parentId;
  }
  if (body.status !== undefined) {
    patch.status = body.status;
  }
}

function assignCatalogPatch(
  modePresets: ModePresetRegistryPort,
  orgId: string,
  body: UpdateAgentBody,
  patch: AgentPatch,
): void {
  if (body.sharedSourceIds !== undefined) {
    patch.sharedSourceIds = body.sharedSourceIds;
  }
  if (body.sourceLevels !== undefined) {
    patch.sourceLevels = body.sourceLevels;
  }
  if (body.secretNames !== undefined) {
    patch.secretNames = body.secretNames;
  }
  if (body.skills !== undefined) {
    patch.skills = body.skills;
  }
  if (body.mcpServers !== undefined) {
    patch.mcpServers = body.mcpServers;
  }
  if (body.enabledPlugins !== undefined) {
    patch.enabledPlugins = body.enabledPlugins;
  }
  if (body.defaultModeId !== undefined) {
    validateDefaultModeId(modePresets, orgId, body.defaultModeId);
    patch.defaultModeId = body.defaultModeId;
  }
}
