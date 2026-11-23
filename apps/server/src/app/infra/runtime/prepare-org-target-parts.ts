import { statSync } from 'node:fs';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';

export interface AgentModelDeps {
  orgId: string;
  agents: AgentRegistryPort;
  models: LlmModelPort;
  providers: LlmProviderPort;
}

export interface AgentModel {
  agent: AgentRecord;
  model: LlmModel;
  provider: LlmProvider;
}

export function resolveAgentAndModel(deps: AgentModelDeps, agentId: string): AgentModel {
  const agent = deps.agents.findById(deps.orgId, agentId);
  if (!agent) {
    throw new ThreadValidationException('agent not found for thread');
  }
  if (!agent.modelId) {
    throw new ThreadValidationException('agent has no model');
  }
  const model = deps.models.findById(deps.orgId, agent.modelId);
  if (!model) {
    throw new ThreadValidationException('model not found');
  }
  const provider = deps.providers.findById(deps.orgId, model.providerId);
  if (!provider) {
    throw new ThreadValidationException('provider not found');
  }
  return { agent, model, provider };
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
