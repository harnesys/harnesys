import { Injectable } from '@harnesys/brix';
import type { AgentHook, AgentPublic, CreateAgentBody } from '@harnesys/contracts';
import {
  AgentConflictException,
  AgentValidationException,
} from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import {
  assertNonEmptyName,
  stripHookConfig,
  toAgentPublic,
  validateDefaultModeId,
  validateExecutionProfileId,
} from './agent.helpers.ts';
import { validateAgentHooks } from './agent-hooks.validation.ts';
import { buildReactGraph, DEFAULT_REACT_BUDGET } from './react-preset.ts';

export interface CreateAgentRequest {
  orgId: string;
  body: CreateAgentBody;
}

@Injectable()
export class CreateAgentUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly modePresets: ModePresetRegistryPort,
    private readonly profiles: ExecutionProfilePort,
  ) {}

  execute(request: CreateAgentRequest): AgentPublic {
    const name = assertNonEmptyName(request.body.name);
    if (this.agents.findByName(request.orgId, name)) {
      throw new AgentConflictException('agent name taken in org');
    }
    const modelId = request.body.modelId.trim();
    if (!modelId) {
      throw new AgentValidationException('modelId is required');
    }
    const defaultModeId = request.body.defaultModeId ?? null;
    validateDefaultModeId(this.modePresets, request.orgId, defaultModeId);
    const executionProfileId = validateExecutionProfileId(
      this.profiles,
      request.orgId,
      request.body.executionProfileId ?? null,
    );
    const id = crypto.randomUUID();
    const hooks = this.validateHooks(request, id);
    const record = buildCreateRecord({
      orgId: request.orgId,
      body: request.body,
      id,
      name,
      modelId,
      defaultModeId,
      executionProfileId,
      hooks,
    });
    return toAgentPublic(this.agents.insert(record));
  }

  private validateHooks(request: CreateAgentRequest, agentId: string): AgentHook[] {
    if (request.body.hooks === undefined) {
      return [];
    }
    const result = validateAgentHooks(request.body.hooks, {
      agentId,
      mcpServers: request.body.mcpServers ?? [],
      agentIds: this.agents.list(request.orgId).map((agent) => agent.id),
    });
    if (!result.ok) {
      throw new AgentValidationException('invalid agent hooks', { issues: result.issues });
    }
    return result.hooks;
  }
}

interface BuildCreateRecordInput {
  orgId: string;
  body: CreateAgentBody;
  id: string;
  name: string;
  modelId: string;
  defaultModeId: string | null;
  executionProfileId: string | null;
  hooks: AgentHook[];
}

function buildCreateRecord(input: BuildCreateRecordInput): AgentRecord {
  const now = new Date().toISOString();
  const { body } = input;
  return {
    id: input.id,
    orgId: input.orgId,
    name: input.name,
    role: body.role.trim() || 'Operator',
    instructions: body.instructions ?? '',
    modelId: input.modelId,
    budgetUsdDaily: body.budgetUsdDaily ?? null,
    level: body.level ?? 'top',
    parentId: body.parentId ?? null,
    executionProfileId: input.executionProfileId,
    status: body.status ?? 'active',
    sharedSourceIds: body.sharedSourceIds ?? [],
    sourceLevels: body.sourceLevels ?? {},
    secretNames: body.secretNames ?? [],
    skills: body.skills ?? [],
    mcpServers: body.mcpServers ?? [],
    enabledPlugins: body.enabledPlugins ?? {},
    defaultModeId: input.defaultModeId,
    config: withDefaultReactConfig(stripHookConfig(body.config ?? {})),
    hooks: input.hooks,
    createdAt: now,
    updatedAt: now,
  };
}

function withDefaultReactConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (config.graphJson !== undefined) {
    return config;
  }
  return {
    ...config,
    graphJson: buildReactGraph(),
    budgetJson: config.budgetJson ?? DEFAULT_REACT_BUDGET,
  };
}
