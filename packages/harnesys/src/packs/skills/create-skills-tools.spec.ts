import { describe, expect, test } from 'bun:test';
import { createSkillsTools } from './create-skills-tools.ts';
import type { SkillsPackPorts } from './skills-ports.ts';

function fakePorts(overrides?: Partial<SkillsPackPorts>): SkillsPackPorts & {
  calls: { orgId?: string; actor?: string; source?: string; query?: string }[];
} {
  const calls: { orgId?: string; actor?: string; source?: string; query?: string }[] = [];
  return {
    calls,
    createSkill: (input) => {
      calls.push({ orgId: input.orgId, actor: input.actor });
      return Promise.resolve({ name: input.body.name });
    },
    installSkill: (input) => {
      calls.push({ orgId: input.orgId, actor: input.actor, source: input.source });
      return Promise.resolve({ installed: ['my-skill'] });
    },
    searchSkills: (query) => {
      calls.push({ query });
      return Promise.resolve({ results: [{ name: 'my-skill', installs: 42 }] });
    },
    resolveOrgId: () => 'org-1',
    ...overrides,
  };
}

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-9' };

describe('skills pack tools', () => {
  test('registers exactly three tools with descriptions', () => {
    const tools = createSkillsTools(fakePorts());
    expect(tools.map((t) => t.name)).toEqual(['create_skill', 'install_skill', 'search_skills']);
    for (const t of tools) {
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  test('operations arrays are exact', () => {
    const byName = new Map(createSkillsTools(fakePorts()).map((t) => [t.name, t]));
    expect(byName.get('create_skill')?.operations).toEqual(['fs.write']);
    expect(byName.get('install_skill')?.operations).toEqual(['network', 'fs.write']);
    expect(byName.get('search_skills')?.operations).toEqual(['network']);
  });

  test('orgId and actor pass through from scope and ctx', async () => {
    const ports = fakePorts();
    const byName = new Map(createSkillsTools(ports).map((t) => [t.name, t]));
    await byName
      .get('create_skill')
      ?.execute({ name: 'a', description: 'd', instructions: 'i' }, ctx);
    await byName.get('install_skill')?.execute({ source: 'owner/repo' }, ctx);
    await byName.get('search_skills')?.execute({ query: 'pdf' }, ctx);
    expect(ports.calls).toEqual([
      { orgId: 'org-1', actor: 'agent:agent-9' },
      { orgId: 'org-1', actor: 'agent:agent-9', source: 'owner/repo' },
      { query: 'pdf' },
    ]);
  });

  test('errors become { error: message } results', async () => {
    const ports = fakePorts({
      searchSkills: () => Promise.reject(new Error('registry unavailable')),
    });
    const byName = new Map(createSkillsTools(ports).map((t) => [t.name, t]));
    const result = await byName.get('search_skills')?.execute({ query: 'pdf' }, ctx);
    expect(result).toEqual({ error: 'registry unavailable' });
  });

  test('missing org scope yields error without calling ports', async () => {
    const ports = fakePorts({ resolveOrgId: () => undefined });
    const byName = new Map(createSkillsTools(ports).map((t) => [t.name, t]));
    const result = await byName
      .get('create_skill')
      ?.execute({ name: 'a', description: 'd', instructions: 'i' }, ctx);
    expect(result).toEqual({ error: 'organization scope is not available' });
    expect(ports.calls).toEqual([]);
  });
});
