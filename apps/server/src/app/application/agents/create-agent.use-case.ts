import { Injectable } from '@harnesys/brix';
import type { AgentHook, AgentPublic, CreateAgentBody, WorkspaceRef } from '@harnesys/contracts';
import type { AgentBudget } from 'harnesys';
import {
  AgentConflictException,
  AgentValidationException,
} from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { requireDepartment } from '../departments/department.helpers.ts';
import {
  assertNonEmptyName,
  stripHookConfig,
  toAgentPublic,
  validateDefaultModeId,
  validateDefaultRunDirectory,
  validateExecutionProfileId,
} from './agent.helpers.ts';
import { validateAgentHooks } from './agent-hooks.validation.ts';
import { validateAgentWorkspaceRef } from './agent-workspace-ref.ts';
import { buildReactGraph, resolveReactBudget } from './react-preset.ts';

export interface CreateAgentRequest {
  orgId: string;
  body: CreateAgentBody;
}

@Injectable()
export class CreateAgentUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly departments: DepartmentRegistryPort,
    private readonly modePresets: ModePresetRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly sources: SourceRegistryPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
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
    if (request.body.departmentId) {
      requireDepartment(this.departments, request.orgId, request.body.departmentId);
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
      defaultRunDirectory: validateDefaultRunDirectory(request.body.defaultRunDirectory ?? null),
      defaultWorkspaceRef: this.workspaceRefOf(request),
      executionProfileId,
      hooks,
    });
    return toAgentPublic(this.agents.insert(record));
  }

  private workspaceRefOf(request: CreateAgentRequest): WorkspaceRef | null {
    const body = request.body;
    if (body.defaultWorkspaceRef !== undefined && body.defaultRunDirectory !== undefined) {
      throw new AgentValidationException(
        'defaultRunDirectory and defaultWorkspaceRef are mutually exclusive',
      );
    }
    return validateAgentWorkspaceRef(
      {
        orgId: request.orgId,
        sources: this.sources,
        layout: this.layout,
        localHostId: this.machineConfig.get().id,
      },
      body.defaultWorkspaceRef ?? null,
    );
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
  defaultRunDirectory: string | null;
  defaultWorkspaceRef: WorkspaceRef | null;
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
    departmentId: body.departmentId ?? null,
    executionProfileId: input.executionProfileId,
    status: body.status ?? 'active',
    sharedSourceIds: body.sharedSourceIds ?? [],
    sourceLevels: body.sourceLevels ?? {},
    secretNames: body.secretNames ?? [],
    skills: body.skills ?? [],
    mcpServers: body.mcpServers ?? [],
    enabledPlugins: body.enabledPlugins ?? {},
    defaultModeId: input.defaultModeId,
    defaultRunDirectory: input.defaultRunDirectory,
    defaultWorkspaceRef: input.defaultWorkspaceRef,
    config: withDefaultReactConfig(
      stripHookConfig(body.config ?? {}),
      (body.level ?? 'top') === 'delegate',
    ),
    hooks: input.hooks,
    createdAt: now,
    updatedAt: now,
  };
}

function withDefaultReactConfig(
  config: Record<string, unknown>,
  isDelegate: boolean,
): Record<string, unknown> {
  const provided = config.budgetJson as AgentBudget | undefined;
  if (config.graphJson !== undefined) {
    return isDelegate && provided?.policy === 'ask'
      ? { ...config, budgetJson: resolveReactBudget(true, provided) }
      : config;
  }
  return {
    ...config,
    graphJson: buildReactGraph(),
    budgetJson: resolveReactBudget(isDelegate, provided),
  };
}
