import {
  type AgentCatalogCreateInput,
  type CapabilityScope,
  type PermissionMap,
  packsShapeError,
} from 'harnesys';
import { buildReactGraph, DEFAULT_REACT_BUDGET } from '../../../application/agents/react-preset.ts';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import type { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';

export interface AgentCatalogCreateDeps {
  orgId: string;
  agents: AgentRegistryPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
}

export function agentCatalogCreate(
  deps: AgentCatalogCreateDeps,
): (input: AgentCatalogCreateInput, scope: CapabilityScope) => Promise<AgentRecord> {
  return (input, scope) => Promise.resolve(createAgentFromCatalog(deps, input, scope));
}

function createAgentFromCatalog(
  deps: AgentCatalogCreateDeps,
  input: AgentCatalogCreateInput,
  scope: CapabilityScope,
): AgentRecord {
  const name = input.name.trim();
  if (!name) {
    throw new Error('agent name cannot be empty');
  }
  if (deps.agents.findByName(deps.orgId, name)) {
    throw new Error(`agent name taken in org: ${name}`);
  }
  const creator = deps.agents.findById(deps.orgId, scope.agentId);
  const modelId = resolveModelId(deps, input, creator?.modelId);
  const config: Record<string, unknown> = {
    graphJson: input.graph ?? buildReactGraph(),
    budgetJson: input.budget ?? DEFAULT_REACT_BUDGET,
  };
  if (input.packs !== undefined) {
    assertPacksShape(input.packs);
    config.capabilitiesJson = input.packs;
  }
  if (input.permissions !== undefined) {
    config.permissionsJson = input.permissions as PermissionMap;
  }
  if (input.color !== undefined) {
    config.color = input.color;
  }
  if (input.model?.effort !== undefined) {
    config.effort = input.model.effort;
  }
  if (input.model?.generation !== undefined) {
    config.generation = input.model.generation;
  }
  const now = new Date().toISOString();
  return deps.agents.insert({
    id: crypto.randomUUID(),
    orgId: deps.orgId,
    name,
    role: input.role.trim() || 'Operator',
    instructions: input.instructions,
    modelId,
    budgetUsdDaily: null,
    level: input.parentId ? 'delegate' : 'top',
    parentId: input.parentId ?? null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: input.skills ?? [],
    mcpServers: input.mcpServers ?? [],
    enabledPlugins: {},
    defaultModeId: null,
    config,
    hooks: [],
    createdAt: now,
    updatedAt: now,
  });
}

function assertPacksShape(packs: unknown): void {
  const error = packsShapeError(packs);
  if (error !== null) {
    throw new Error(`invalid packs: ${error}`);
  }
}

function resolveModelId(
  deps: AgentCatalogCreateDeps,
  input: AgentCatalogCreateInput,
  inheritedModelId: string | undefined,
): string {
  if (input.model === undefined) {
    if (!inheritedModelId) {
      throw new Error('model is required: no model ref given and creator has no model');
    }
    return inheritedModelId;
  }
  const provider = deps.providers.findByName(deps.orgId, input.model.provider);
  if (!provider) {
    throw new Error(`model provider not found: ${input.model.provider}`);
  }
  const model = deps.models.findByProviderAndName(deps.orgId, provider.id, input.model.model);
  if (!model) {
    throw new Error(`model not found: ${input.model.provider}/${input.model.model}`);
  }
  return model.id;
}
