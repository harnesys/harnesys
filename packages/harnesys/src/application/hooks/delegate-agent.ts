import { DEFAULT_PERMISSIONS } from '../../constants.ts';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { resolveCapabilitySet, sandboxUniverse } from '../capability-set.ts';
import { compileOrThrow } from '../compile.ts';
import type { GraphOpts } from '../graph.ts';
import type { ChildRunner } from '../graph-spawn.ts';
import type { PackRunMap } from '../packs/pack-run.ts';
import { intersectPermissions } from '../permissions.ts';
import { subtractDeniedTools } from '../tool-registry.ts';
import { createLoadToolsTool } from '../tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from '../tools/exposure.ts';

export interface HookDelegationResult {
  text: string;
  error?: string;
}

export async function delegateHookAgent(input: {
  parent: GraphOpts;
  def: AgentDefinition;
  prompt: string;
  runChild: ChildRunner;
}): Promise<HookDelegationResult> {
  const { parent, def, prompt, runChild } = input;
  const spawnId = crypto.randomUUID();
  const childDef: AgentDefinition = { ...def, hooks: undefined };
  const plan = compileOrThrow(childDef);
  const childState = parent.state.child(spawnId);
  const { registry, packOutputs } = childRegistry(parent, childDef);
  const childOpts: GraphOpts = {
    agent: childDef,
    input: prompt,
    state: childState,
    permissions: intersectPermissions(
      def.permissions ?? DEFAULT_PERMISSIONS,
      parent.permissions ?? DEFAULT_PERMISSIONS,
    ),
    paths: parent.paths,
    process: parent.process,
    models: parent.models,
    fileAccess: parent.fileAccessFor?.(childDef) ?? parent.fileAccess,
    toolRegistry: registry,
    plan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal: parent.signal,
    notes: parent.notes,
    packOutputs,
    universe: parent.universe,
    skills: parent.skills,
    env: parent.env,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    logger: parent.logger,
    sandbox: true,
  };
  try {
    for await (const ev of runChild(childOpts)) {
      parent.childJournal?.(spawnId, ev);
    }
  } catch (error) {
    return { text: '', error: errorMessage(error) };
  }
  const snap = await childState.load();
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  const text = textOfOutput(lastMessage(rec));
  if (snap?.status !== 'completed') {
    return { text, error: `delegated agent ended with status ${snap?.status ?? 'failed'}` };
  }
  return { text };
}

interface ChildRegistry {
  registry: Map<string, ToolDefinition>;
  packOutputs?: PackRunMap;
}

function childRegistry(parent: GraphOpts, childDef: AgentDefinition): ChildRegistry {
  if (parent.universe !== undefined) {
    const childSet = resolveCapabilitySet(childDef, sandboxUniverse(parent.universe));
    const registry = new Map(
      [...childSet.registry].map(([name, entry]) => [
        name,
        { ...entry.def, exposure: entry.exposure },
      ]),
    );
    return { registry, packOutputs: childSet.packOutputs };
  }
  const registry = subtractDeniedTools(parent.toolRegistry, childDef);
  for (const [name, def] of registry) {
    if (def.group === 'agents') {
      registry.delete(name);
    }
  }
  registry.set(LOAD_TOOLS_NAME, createLoadToolsTool(registry));
  return { registry, packOutputs: parent.packOutputs };
}

function lastMessage(state: Record<string, unknown>): unknown {
  const messages = state.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    return messages[messages.length - 1];
  }
  return undefined;
}

function textOfOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const content = (value as { content?: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }
    const text = (value as { text?: unknown }).text;
    if (typeof text === 'string') {
      return text;
    }
  }
  return '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
