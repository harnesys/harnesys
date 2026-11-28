import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { AgentCatalogPatch, AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { createAgentLifecycleTools } from './create-agent-lifecycle-tools.ts';

const ctx = {} as ToolContext;

function summary(parts: Partial<AgentCatalogSummary>): AgentCatalogSummary {
  return {
    id: 'agent-1',
    name: 'LeadIntake',
    role: 'intake',
    instructions: '',
    parentId: null,
    ...parts,
  };
}

function depsWith(
  rows: AgentCatalogSummary[],
  calls: Array<{ id: string; patch: AgentCatalogPatch }>,
  opts: { ownDelegatesOnly?: boolean } = {},
): Parameters<typeof createAgentLifecycleTools>[0] {
  return {
    agents: {
      list: async () => rows,
      get: async () => null,
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
    ...(opts.ownDelegatesOnly === true ? { ownDelegatesOnly: true } : {}),
  };
}

function updateTool(deps: Parameters<typeof createAgentLifecycleTools>[0]) {
  const tool = createAgentLifecycleTools(deps).find((row) => row.name === 'agents_update');
  if (!tool) {
    throw new Error('agents_update tool missing');
  }
  return tool;
}

describe('agents_update tool', () => {
  test('patches a top-level agent (no ownership gate)', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({})], calls);
    const out = await updateTool(deps).execute(
      { agentId: 'LeadIntake', instructions: 'step 3: pass sourceId in issue_create' },
      ctx,
    );
    expect(out).toEqual({ agentId: 'agent-1' });
    expect(calls).toEqual([
      {
        id: 'agent-1',
        patch: { instructions: 'step 3: pass sourceId in issue_create' },
      },
    ]);
  });

  test('patches delegates of other agents and model ref maps to patch', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({ id: 'a9', name: 'Helper', parentId: 'other-agent' })], calls);
    const out = await updateTool(deps).execute(
      { agentId: 'Helper', model: { provider: 'openai', model: 'gpt-5' }, status: 'archived' },
      ctx,
    );
    expect(out).toEqual({ agentId: 'a9' });
    expect(calls[0]?.patch.model).toEqual({ provider: 'openai', model: 'gpt-5' });
    expect(calls[0]?.patch.status).toBe('archived');
  });

  test('rejects plugin agents and unknown targets', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({ id: 'plugin:x', name: 'Plug', plugin: true })], calls);
    const out = await updateTool(deps).execute({ agentId: 'Plug', role: 'x' }, ctx);
    expect(out).toEqual({
      error: 'unknown spawn target "Plug". Available agents: (none)',
    });
    expect(calls).toEqual([]);
  });

  test('rejects empty patch', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({})], calls);
    const out = await updateTool(deps).execute({ agentId: 'agent-1' }, ctx);
    expect(out).toEqual({ error: 'nothing to update' });
    expect(calls).toEqual([]);
  });

  test('permissions flow into the patch and force the approval ask', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const row = updateTool(depsWith([summary({})], calls));
    const out = await row.execute(
      { agentId: 'LeadIntake', permissions: { 'fs.write': 'allow' } },
      ctx,
    );
    expect(out).toEqual({ agentId: 'agent-1' });
    expect(calls[0]?.patch.permissions).toEqual({ 'fs.write': 'allow' });
    expect(row.gate?.({ agentId: 'x', permissions: {} }, { cwd: '' })).toEqual({ decision: 'ask' });
  });

  test('gate stays silent when permissions are untouched', () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const row = updateTool(depsWith([summary({})], calls));
    expect(row.gate?.({ agentId: 'x', instructions: 'y' }, { cwd: '' })).toBeUndefined();
  });

  test('non-object permissions fails without a patch call', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const row = updateTool(depsWith([summary({})], calls));
    const out = await row.execute({ agentId: 'LeadIntake', permissions: 'fs.write=allow' }, ctx);
    expect(out).toEqual({
      error: 'permissions must be an object mapping operation to allow|ask|deny',
    });
    expect(calls).toEqual([]);
  });
});

describe('agents_update ownDelegatesOnly', () => {
  test('patches own delegate', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({ id: 'd1', name: 'Worker', parentId: 'caller-1' })], calls, {
      ownDelegatesOnly: true,
    });
    const out = await updateTool(deps).execute(
      { agentId: 'Worker', budget: { maxSteps: 30 } },
      ctx,
    );
    expect(out).toEqual({ agentId: 'd1' });
    expect(calls[0]?.patch.budget).toEqual({ maxSteps: 30 });
  });

  test('rejects a top-level agent', async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({ id: 'top', name: 'Planner', parentId: null })], calls, {
      ownDelegatesOnly: true,
    });
    const out = await updateTool(deps).execute({ agentId: 'Planner', role: 'x' }, ctx);
    expect(out).toEqual({
      error:
        '"Planner" is not your delegate; this host limits agents_update to delegates created by you (top-level agents are managed in the project UI).',
    });
    expect(calls).toEqual([]);
  });

  test("rejects another agent's delegate", async () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const deps = depsWith([summary({ id: 'a9', name: 'Helper', parentId: 'other-agent' })], calls, {
      ownDelegatesOnly: true,
    });
    const out = await updateTool(deps).execute({ agentId: 'Helper', role: 'x' }, ctx);
    expect(out).toEqual({
      error:
        '"Helper" is not your delegate; this host limits agents_update to delegates created by you (top-level agents are managed in the project UI).',
    });
    expect(calls).toEqual([]);
  });

  test('description states the scope without contradicting itself', () => {
    const calls: Array<{ id: string; patch: AgentCatalogPatch }> = [];
    const scoped = updateTool(depsWith([], calls, { ownDelegatesOnly: true }));
    const unscoped = updateTool(depsWith([], calls));
    expect(scoped.description).toContain('Patch delegates created by you');
    expect(scoped.description).not.toContain('Patch any agent in the org');
    expect(unscoped.description).toContain('Patch any agent in the org (top-level and delegates');
    expect(unscoped.description).not.toContain('limits agents_update');
  });
});
