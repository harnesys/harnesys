import { describe, expect, test } from 'bun:test';
import type { AgentCatalogPatch, CapabilityScope } from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import type { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import { OrgAgentsCatalogPort } from './org-agents-catalog.port.ts';

const NOW = '2026-01-01T00:00:00.000Z';

function agentRecord(parts: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-top',
    orgId: 'org-1',
    name: 'LeadIntake',
    role: 'intake',
    instructions: 'old instructions',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    config: { graphJson: { nodes: [] } },
    hooks: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...parts,
  };
}

function registry(rows: AgentRecord[], updated: AgentRecord[]): AgentRegistryPort {
  const port: Pick<AgentRegistryPort, 'findById' | 'findByName' | 'list' | 'update'> = {
    findById: (_orgId, id) => rows.find((row) => row.id === id),
    findByName: (_orgId, name) => rows.find((row) => row.name === name),
    list: () => rows,
    update: (_orgId, id, patch) => {
      const row = rows.find((item) => item.id === id);
      if (!row) {
        throw new Error(`agent ${id} not found`);
      }
      const next = { ...row, ...patch } as AgentRecord;
      updated.push(next);
      return next;
    },
  };
  return port as AgentRegistryPort;
}

function providers(): LlmProviderPort {
  const port: Pick<LlmProviderPort, 'findByName'> = {
    findByName: (_orgId, name) =>
      name === 'openai' ? ({ id: 'prov-1', name } as never) : undefined,
  };
  return port as LlmProviderPort;
}

function models(): LlmModelPort {
  const port: Pick<LlmModelPort, 'findByProviderAndName'> = {
    findByProviderAndName: (_orgId, providerId, name) =>
      providerId === 'prov-1' && name === 'gpt-5' ? ({ id: 'model-9', name } as never) : undefined,
  };
  return port as LlmModelPort;
}

function scope(): CapabilityScope {
  return { orgId: 'org-1', agentId: 'caller-1', sourceIds: [], threadId: 'thread-1' };
}

describe('OrgAgentsCatalogPort.patch', () => {
  test('any agent can patch a top-level agent: model resolved, config merged, graph preserved', async () => {
    const updated: AgentRecord[] = [];
    const rows = [agentRecord({})];
    const reg = registry(rows, updated);
    const port = new OrgAgentsCatalogPort({
      orgId: 'org-1',
      agents: reg,
      providers: providers(),
      models: models(),
      createAgent: () => Promise.reject(new Error('not used')),
    });
    const patch: AgentCatalogPatch = {
      instructions: 'step 3: pass sourceId',
      model: { provider: 'openai', model: 'gpt-5' },
      budget: { maxSteps: 42 },
      config: { color: '#ff0000' },
    };
    await port.patch(scope(), 'agent-top', patch);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.instructions).toBe('step 3: pass sourceId');
    expect(updated[0]?.modelId).toBe('model-9');
    expect(updated[0]?.config.graphJson).toEqual({ nodes: [] });
    expect(updated[0]?.config.budgetJson).toEqual({ maxSteps: 42 });
    expect(updated[0]?.config.color).toBe('#ff0000');
  });

  test('parentId switch derives level', async () => {
    const updated: AgentRecord[] = [];
    const rows = [agentRecord({}), agentRecord({ id: 'child-1', name: 'Kid', level: 'delegate' })];
    const reg = registry(rows, updated);
    const port = new OrgAgentsCatalogPort({
      orgId: 'org-1',
      agents: reg,
      providers: providers(),
      models: models(),
      createAgent: () => Promise.reject(new Error('not used')),
    });
    await port.patch(scope(), 'child-1', { parentId: null });
    expect(updated[0]?.level).toBe('top');
  });

  test('name conflicts and unknown models fail without update', async () => {
    const updated: AgentRecord[] = [];
    const rows = [agentRecord({}), agentRecord({ id: 'agent-2', name: 'Taken' })];
    const reg = registry(rows, updated);
    const port = new OrgAgentsCatalogPort({
      orgId: 'org-1',
      agents: reg,
      providers: providers(),
      models: models(),
      createAgent: () => Promise.reject(new Error('not used')),
    });
    await expect(port.patch(scope(), 'agent-top', { name: 'Taken' })).rejects.toThrow(
      'agent name taken in org',
    );
    await expect(
      port.patch(scope(), 'agent-top', { model: { provider: 'openai', model: 'nope' } }),
    ).rejects.toThrow('model not found: openai/nope');
    expect(updated).toHaveLength(0);
  });

  test('permissions keys in config patch are stripped (no self-grant)', async () => {
    const updated: AgentRecord[] = [];
    const rows = [agentRecord({})];
    const reg = registry(rows, updated);
    const port = new OrgAgentsCatalogPort({
      orgId: 'org-1',
      agents: reg,
      providers: providers(),
      models: models(),
      createAgent: () => Promise.reject(new Error('not used')),
    });
    await port.patch(scope(), 'agent-top', {
      config: {
        permissionsJson: { agents: 'allow' },
        permissions: { process: 'allow' },
        color: '#fff',
      },
    });
    expect(updated[0]?.config.color).toBe('#fff');
    expect(updated[0]?.config.permissionsJson).toBeUndefined();
    expect(updated[0]?.config.permissions).toBeUndefined();
    expect(updated[0]?.config.graphJson).toEqual({ nodes: [] });
  });
});
