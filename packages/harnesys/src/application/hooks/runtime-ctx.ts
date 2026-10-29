import { callModel } from '../../adapters/ai-llm-adapter.ts';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../../ports/models.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { type GraphOpts, startGraph } from '../graph.ts';
import { findBind, isPort } from '../graph-helpers.ts';
import type { RunEngineDeps } from '../run-engine-types.ts';
import type { HookRunReport, HookRuntimeCtx } from './bus.ts';
import { delegateHookAgent } from './delegate-agent.ts';

export interface HookRuntimeCtxInput {
  deps: RunEngineDeps;
  agent: AgentDefinition;
  runRegistry: Map<string, ToolDefinition>;
  cwd: string;
  envBase: Record<string, string>;
  signal: AbortSignal;
  parent: GraphOpts;
  report?: (report: HookRunReport) => void;
}

interface ModelCoords {
  provider: string;
  model: string;
}

export function createHookRuntimeCtx(input: HookRuntimeCtxInput): HookRuntimeCtx {
  const { deps, agent, runRegistry, cwd, envBase, signal, parent } = input;
  return {
    cwd,
    projectDir: cwd,
    envBase,
    ...(input.report !== undefined ? { report: input.report } : {}),
    promptModel: async (prompt: string, model?: string): Promise<string> => {
      const coords = resolveHookModelCoords(model, agent);
      if (coords === null) {
        throw new Error('hook prompt: agent has no model');
      }
      const binding = await resolveHookBinding(deps.models, coords, agent);
      const stream = callModel({
        binding,
        prompt: '',
        messages: [{ role: 'user', content: prompt }],
        toolNames: [],
        signalOrRegistry: signal,
        maybeSignal: signal,
        rawRequestDir: parent.paths?.threadDir,
        rawRequestMode: agent.observability?.rawRequests,
      });
      let text = '';
      for await (const chunk of stream) {
        if (chunk.type === 'completed') {
          text = chunk.text ?? '';
        }
      }
      return text;
    },
    mcpToolCall: async (
      server: string,
      tool: string,
      toolInput: Record<string, unknown>,
    ): Promise<unknown> => {
      if (!(agent.mcpServers ?? []).includes(server)) {
        throw new Error(`mcp server is not connected to this agent: ${server}`);
      }
      const def = runRegistry.get(`${server}__${tool}`);
      if (def === undefined) {
        throw new Error(`mcp tool not found: ${server}__${tool}`);
      }
      return await def.execute(toolInput, {
        cwd,
        paths: { allow: parent.paths?.allow ?? [] },
        signal,
        sandbox: true,
        agentId: agent.id,
      });
    },
    delegateAgent: async (agentId: string, prompt: string): Promise<string> => {
      const target = deps.agents.resolve(agentId, agent);
      if (target === undefined) {
        throw new Error(`unknown delegate agent: ${agentId}`);
      }
      const result = await delegateHookAgent({
        parent,
        def: target,
        prompt,
        runChild: deps.childRunner ?? startGraph,
      });
      if (result.error !== undefined) {
        throw new Error(result.error);
      }
      return result.text;
    },
  };
}

function resolveHookModelCoords(
  model: string | undefined,
  agent: AgentDefinition,
): ModelCoords | null {
  const trimmed = model?.trim() ?? '';
  if (trimmed !== '') {
    const slash = trimmed.indexOf('/');
    if (slash > 0) {
      return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) };
    }
    const provider = agent.model?.provider;
    if (provider === undefined) {
      return null;
    }
    return { provider, model: trimmed };
  }
  if (agent.model === undefined) {
    return null;
  }
  return { provider: agent.model.provider, model: agent.model.model };
}

async function resolveHookBinding(
  models: ProviderConfig[] | ModelsPort,
  coords: ModelCoords,
  agent: AgentDefinition,
): Promise<ModelBinding> {
  if (isPort(models)) {
    return await models.get(coords.provider, coords.model);
  }
  const found = findBind(models as ProviderConfig[], coords, agent);
  if (found === null) {
    throw new Error(`model not found: ${coords.provider}/${coords.model}`);
  }
  return found.binding;
}
