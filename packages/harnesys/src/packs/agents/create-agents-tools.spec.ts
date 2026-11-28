import { describe, expect, test } from 'bun:test';
import { validateToolInput } from '../../application/tool-registry.ts';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { AgentCatalogPatch, AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { createAgentLifecycleTools } from './create-agent-lifecycle-tools.ts';
import { createAgentsTools } from './create-agents-tools.ts';

const ctx = {} as ToolContext;

const INSTRUCTIONS = 'full worker system instructions text';
const BUDGET = {
  maxSteps: 40,
  policy: 'ask',
  warnAtSteps: 5,
  closeOnExhaustion: true,
  extendDefaultPct: 50,
} as const;

function listingRows(): AgentCatalogSummary[] {
  return [
    { id: 'a1', name: 'Worker', role: 'dev', instructions: INSTRUCTIONS, parentId: null },
    { id: 'a2', name: 'Lead', role: 'dev', instructions: 'lead instructions text', parentId: null },
  ];
}

function listingDeps(
  calls: Array<{ id: string; patch: AgentCatalogPatch }>,
): Parameters<typeof createAgentsTools>[0] {
  const rows = listingRows();
  const definition: AgentDefinition = {
    id: 'a1',
    prompts: { main: { instructions: INSTRUCTIONS } },
    graph: { nodes: {}, edges: [] },
    model: { provider: 'openai', model: 'gpt-5', effort: 'high', generation: { temperature: 0.2 } },
    budget: BUDGET,
    packs: { files: true },
  };
  return {
    agents: {
      list: async (_scope, filter) =>
        rows.filter(
          (row) =>
            (filter?.role === undefined || row.role === filter.role) &&
            (filter?.name === undefined || row.name === filter.name),
        ),
      get: async (_scope, id) => (id === 'a1' ? definition : null),
      create: async () => {
        throw new Error('not used');
      },
      patch: async (_scope, id, patch) => {
        calls.push({ id, patch });
      },
    },
    resolveScope: (): CapabilityScope => ({
      orgId: 'org-1',
      agentId: 'caller-1',
      sourceIds: [],
      threadId: 'thread-1',
    }),
  };
}

function toolOf<T extends { name: string }>(tools: T[], name: string): T {
  const found = tools.find((row) => row.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function listEntries(out: unknown): Array<Record<string, unknown>> {
  return out as Array<Record<string, unknown>>;
}

describe('agents_list', () => {
  test('omits instructions by default and keeps compact fields', async () => {
    const tool = toolOf(createAgentsTools(listingDeps([])), 'agents_list');
    const out = listEntries(await tool.execute({}, ctx));
    expect(out).toHaveLength(2);
    const worker = out.find((row) => row.name === 'Worker');
    expect(worker?.instructions).toBeUndefined();
    expect(worker?.packs).toEqual(['files']);
    expect(worker?.budget).toEqual(BUDGET);
    expect(worker?.level).toBe('top');
    const json = JSON.stringify(out);
    expect(json).not.toContain(INSTRUCTIONS);
    expect(json).not.toContain('lead instructions');
  });

  test('returns model as a wire object with effort and no extra fields', async () => {
    const tool = toolOf(createAgentsTools(listingDeps([])), 'agents_list');
    const out = listEntries(await tool.execute({ name: 'Worker' }, ctx));
    expect(out).toHaveLength(1);
    expect(out[0]?.model).toEqual({ provider: 'openai', model: 'gpt-5', effort: 'high' });
    expect(JSON.stringify(out[0]?.model)).not.toContain('temperature');
  });

  test('a name filter isolating one agent includes full instructions', async () => {
    const tool = toolOf(createAgentsTools(listingDeps([])), 'agents_list');
    const out = listEntries(await tool.execute({ name: 'Worker' }, ctx));
    expect(out).toHaveLength(1);
    expect(out[0]?.instructions).toBe(INSTRUCTIONS);
  });

  test('a role filter matching several agents stays compact', async () => {
    const tool = toolOf(createAgentsTools(listingDeps([])), 'agents_list');
    const out = listEntries(await tool.execute({ role: 'dev' }, ctx));
    expect(out).toHaveLength(2);
    for (const row of out) {
      expect(row.instructions).toBeUndefined();
    }
  });

  test('verbose:true includes instructions without a filter', async () => {
    const tool = toolOf(createAgentsTools(listingDeps([])), 'agents_list');
    const out = listEntries(await tool.execute({ verbose: true }, ctx));
    expect(out).toHaveLength(2);
    expect(out.map((row) => row.instructions)).toEqual([INSTRUCTIONS, 'lead instructions text']);
  });
});

describe('agents_list → agents_update wire roundtrip', () => {
  test('listed model and budget objects pass the update schema and persist', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = listingDeps(calls);
    const listed = listEntries(
      await toolOf(createAgentsTools(deps), 'agents_list').execute({ name: 'Worker' }, ctx),
    );
    const entry = listed[0] ?? {};
    const update = toolOf(createAgentLifecycleTools(deps), 'agents_update');
    const input = { agentId: 'Worker', model: entry.model, budget: entry.budget };
    expect(validateToolInput(update.input, input)).toEqual({ ok: true });
    expect(await update.execute(input, ctx)).toEqual({ agentId: 'a1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.patch.model).toEqual({ provider: 'openai', model: 'gpt-5', effort: 'high' });
    expect(calls[0]?.patch.budget).toEqual(BUDGET);
  });
});
