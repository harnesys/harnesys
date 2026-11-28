import type { AgentHook } from '@harnesys/contracts';
import type {
  AgentCatalogCreated,
  AgentCatalogCreateInput,
  AgentCatalogDefinition,
  AgentCatalogPatch,
  AgentCatalogSummary,
  AgentDefinition,
  AgentsCatalogPort,
  CapabilityScope,
  PackInventoryGroup,
  PackRegistration,
  ToolDefinition,
} from 'harnesys';
import {
  stripHookConfig,
  validateDefaultModeId,
  validateExecutionProfileId,
} from '../../../application/agents/agent.helpers.ts';
import { validateAgentHooks } from '../../../application/agents/agent-hooks.validation.ts';
import type { AgentPatch, AgentRecord } from '../../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../../domain/execution-profile/execution-profile.port.ts';
import { ModePresetRegistryPort } from '../../../domain/mode-presets/mode-preset-registry.port.ts';
import type { PluginAgentEntry } from '../../../domain/plugin/plugin-runtime.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import { toAgentDefinition } from '../agent-definition.mapper.ts';
import type { OrgPluginRuntimeSource } from '../org-plugin-wiring.ts';
import { packInventoryOf } from './pack-inventory.ts';

const PERMISSIONS_CONFIG_KEYS = ['permissionsJson', 'permissions'] as const;

function assertNoPermissionsInConfig(config: Record<string, unknown>): void {
  const offender = PERMISSIONS_CONFIG_KEYS.find((key) => config[key] !== undefined);
  if (offender !== undefined) {
    throw new Error(`permissions must be set via the permissions field, not config.${offender}`);
  }
}

export interface OrgAgentsCatalogDeps {
  orgId: string;
  agents: AgentRegistryPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
  createAgent: (input: AgentCatalogCreateInput, scope: CapabilityScope) => Promise<AgentRecord>;
  plugins?: OrgPluginRuntimeSource;
  modes?: ModePresetRegistryPort;
  profiles?: ExecutionProfilePort;
  packRegistrations?: () => PackRegistration[];
  baseRegistry?: () => Map<string, ToolDefinition>;
}

export class OrgAgentsCatalogPort implements AgentsCatalogPort {
  constructor(private readonly deps: OrgAgentsCatalogDeps) {}

  async list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]> {
    const rows = this.deps.agents.list(scope.orgId).filter((row) => {
      if (row.parentId !== null && row.parentId !== scope.agentId) {
        return false;
      }
      if (filter?.role !== undefined && row.role !== filter.role) {
        return false;
      }
      if (filter?.name !== undefined && row.name !== filter.name) {
        return false;
      }
      return true;
    });
    const base = rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      instructions: row.instructions,
      parentId: row.parentId,
      ...(typeof row.config.color === 'string' ? { color: row.config.color } : {}),
    }));
    const plugin = await this.enabledPluginAgents(scope);
    return [...base, ...plugin.map(toPluginSummary)];
  }

  async get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null> {
    const agent = this.deps.agents.findById(scope.orgId, id);
    if (agent !== undefined) {
      return definitionOf(this.deps, agent);
    }
    if (!id.includes(':')) {
      return null;
    }
    const entry = (await this.enabledPluginAgents(scope)).find((row) => row.id === id);
    return entry === undefined ? null : entry.definition;
  }

  async listDefinitions(scope: CapabilityScope): Promise<AgentCatalogDefinition[]> {
    const visible = this.deps.agents
      .list(scope.orgId)
      .filter((row) => row.parentId === null || row.parentId === scope.agentId);
    const plugin = await this.enabledPluginAgents(scope);
    return [
      ...visible.map((row) => ({ id: row.id, definition: definitionOf(this.deps, row) })),
      ...plugin.map((entry) => ({ id: entry.id, definition: entry.definition })),
    ];
  }

  async create(
    scope: CapabilityScope,
    input: AgentCatalogCreateInput,
  ): Promise<AgentCatalogCreated> {
    const created = await this.deps.createAgent(input, scope);
    const def = definitionOf(this.deps, created);
    const packsConfig = Object.fromEntries(
      Object.entries(def.packs ?? {}).filter(([, value]) => value !== false && value !== null),
    );
    return {
      id: created.id,
      name: created.name,
      role: created.role,
      instructions: created.instructions,
      parentId: created.parentId,
      packs: Object.keys(def.packs ?? {}).filter((name) => def.packs?.[name]),
      ...(Object.keys(packsConfig).length > 0 ? { packsConfig } : {}),
      ...(def.model ? { model: def.model } : {}),
      ...(def.budget ? { budget: def.budget } : {}),
      ...(def.permissions ? { permissions: def.permissions } : {}),
    };
  }

  async packInventory(scope?: CapabilityScope): Promise<PackInventoryGroup[]> {
    const orgId = scope?.orgId ?? this.deps.orgId;
    const agent =
      scope?.agentId !== undefined ? this.deps.agents.findById(orgId, scope.agentId) : undefined;
    const def = agent === undefined ? undefined : definitionOf(this.deps, agent);
    return packInventoryOf(this.deps, def);
  }

  async patch(scope: CapabilityScope, id: string, patch: AgentCatalogPatch): Promise<void> {
    const agent = this.deps.agents.findById(scope.orgId, id);
    if (!agent) {
      throw new Error(`agent "${id}" not found`);
    }
    const next = this.buildPatch(agent, patch);
    this.deps.agents.update(scope.orgId, id, next);
  }

  private buildPatch(agent: AgentRecord, patch: AgentCatalogPatch): AgentPatch {
    const next: AgentPatch & { config?: Record<string, unknown> } = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new Error('agent name cannot be empty');
      }
      const existing = this.deps.agents.findByName(this.deps.orgId, name);
      if (existing && existing.id !== agent.id) {
        throw new Error('agent name taken in org');
      }
      next.name = name;
    }
    if (patch.role !== undefined) {
      next.role = patch.role.trim() || 'Operator';
    }
    if (patch.instructions !== undefined) {
      next.instructions = patch.instructions.trim();
    }
    if (patch.model !== undefined) {
      next.modelId = this.resolveModelId(patch.model);
    }
    if (patch.parentId !== undefined) {
      next.parentId = patch.parentId;
      next.level = patch.parentId === null ? 'top' : 'delegate';
    }
    if (patch.hooks !== undefined) {
      this.assignHooks(agent.id, agent.mcpServers, patch.hooks, next);
    }
    const config = this.buildConfigPatch(agent, patch);
    if (config !== undefined) {
      next.config = config;
    }
    this.assignRegistryValidated(patch, next);
    return next;
  }

  private assignHooks(
    agentId: string,
    mcpServers: string[],
    hooks: unknown[],
    next: AgentPatch,
  ): void {
    const result = validateAgentHooks(hooks as AgentHook[], {
      agentId,
      mcpServers,
      agentIds: this.deps.agents.list(this.deps.orgId).map((row) => row.id),
    });
    if (!result.ok) {
      throw new Error(`invalid agent hooks: ${result.issues.map(String).join('; ')}`);
    }
    next.hooks = result.hooks;
  }

  private buildConfigPatch(
    agent: AgentRecord,
    patch: AgentCatalogPatch,
  ): Record<string, unknown> | undefined {
    let config: Record<string, unknown> | undefined;
    if (patch.model !== undefined) {
      config = { ...agent.config };
      if (patch.model.effort !== undefined) {
        config.effort = patch.model.effort;
      } else {
        delete config.effort;
      }
    }
    if (patch.budget !== undefined) {
      config = { ...(config ?? agent.config), budgetJson: patch.budget };
    }
    if (patch.permissions !== undefined) {
      config = { ...(config ?? agent.config), permissionsJson: patch.permissions };
    }
    if (patch.config !== undefined) {
      assertNoPermissionsInConfig(patch.config);
      config = {
        ...(config ?? agent.config),
        ...stripHookConfig(patch.config),
      };
    }
    return config;
  }

  private assignRegistryValidated(patch: AgentCatalogPatch, next: AgentPatch): void {
    if (patch.budgetUsdDaily !== undefined) {
      next.budgetUsdDaily = patch.budgetUsdDaily;
    }
    if (patch.status !== undefined) {
      next.status = patch.status;
    }
    if (patch.sharedSourceIds !== undefined) {
      next.sharedSourceIds = patch.sharedSourceIds;
    }
    if (patch.sourceLevels !== undefined) {
      next.sourceLevels = patch.sourceLevels;
    }
    if (patch.secretNames !== undefined) {
      next.secretNames = patch.secretNames;
    }
    if (patch.skills !== undefined) {
      next.skills = patch.skills;
    }
    if (patch.mcpServers !== undefined) {
      next.mcpServers = patch.mcpServers;
    }
    if (patch.enabledPlugins !== undefined) {
      next.enabledPlugins = patch.enabledPlugins;
    }
    if (patch.executionProfileId !== undefined) {
      if (!this.deps.profiles) {
        throw new Error('execution profiles are not available in this host');
      }
      next.executionProfileId = validateExecutionProfileId(
        this.deps.profiles,
        this.deps.orgId,
        patch.executionProfileId,
      );
    }
    if (patch.defaultModeId !== undefined) {
      if (!this.deps.modes) {
        throw new Error('mode presets are not available in this host');
      }
      validateDefaultModeId(this.deps.modes, this.deps.orgId, patch.defaultModeId);
      next.defaultModeId = patch.defaultModeId;
    }
  }

  private resolveModelId(model: { provider: string; model: string }): string {
    const provider = this.deps.providers.findByName(this.deps.orgId, model.provider);
    if (!provider) {
      throw new Error(`model provider not found: ${model.provider}`);
    }
    const found = this.deps.models.findByProviderAndName(this.deps.orgId, provider.id, model.model);
    if (!found) {
      throw new Error(`model not found: ${model.provider}/${model.model}`);
    }
    return found.id;
  }

  remove(scope: CapabilityScope, id: string): Promise<{ ok: true } | { error: string }> {
    const agent = this.deps.agents.findById(scope.orgId, id);
    if (!agent) {
      return Promise.resolve({ error: 'agent not found' });
    }
    if (agent.parentId !== scope.agentId) {
      return Promise.resolve({ error: 'not your delegate' });
    }
    this.deps.agents.delete(scope.orgId, id);
    return Promise.resolve({ ok: true });
  }

  private async enabledPluginAgents(scope: CapabilityScope): Promise<PluginAgentEntry[]> {
    if (this.deps.plugins === undefined) {
      return [];
    }
    const enabled = this.deps.agents.findById(scope.orgId, scope.agentId)?.enabledPlugins;
    if (enabled === undefined || Object.keys(enabled).length === 0) {
      return [];
    }
    const agents = await bundleAgents(this.deps.plugins, scope.orgId);
    return agents.filter((entry) => enabled[entry.plugin] === true);
  }
}

async function bundleAgents(
  plugins: OrgPluginRuntimeSource,
  orgId: string,
): Promise<PluginAgentEntry[]> {
  try {
    return (await plugins.bundle(orgId)).agents;
  } catch {
    return [];
  }
}

function toPluginSummary(entry: PluginAgentEntry): AgentCatalogSummary {
  return {
    id: entry.id,
    name: entry.name,
    role: entry.name,
    instructions: entry.definition.prompts.main?.instructions ?? '',
    plugin: true,
  };
}

function definitionOf(deps: OrgAgentsCatalogDeps, agent: AgentRecord): AgentDefinition {
  const model = agent.modelId ? deps.models.findById(deps.orgId, agent.modelId) : undefined;
  const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
  return toAgentDefinition(agent, { model, provider });
}
