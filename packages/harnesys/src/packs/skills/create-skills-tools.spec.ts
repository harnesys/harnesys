import { describe, expect, test } from 'bun:test';
import { createSkillsTools } from './create-skills-tools.ts';
import type { SkillsPackPorts } from './skills-ports.ts';

function fakePorts(overrides?: Partial<SkillsPackPorts>): SkillsPackPorts & {
  calls: { orgId?: string; actor?: string; source?: string; query?: string; name?: string }[];
} {
  const calls: {
    orgId?: string;
    actor?: string;
    source?: string;
    query?: string;
    name?: string;
  }[] = [];
  return {
    calls,
    createSkill: (input) => {
      calls.push({ orgId: input.orgId, actor: input.actor });
      return Promise.resolve({ name: input.body.name });
    },
    listSkills: (orgId) => {
      calls.push({ orgId });
      return Promise.resolve({
        skills: [
          { name: 'my-skill', origin: 'org' },
          { name: 'automations', origin: 'system' },
          { name: 'repo-skill', origin: 'source:acme/repo', installedFrom: 'acme/repo' },
        ],
      });
    },
    deleteSkill: (input) => {
      calls.push({ orgId: input.orgId, name: input.name });
      return Promise.resolve();
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
  test('registers five tools with descriptions', () => {
    const tools = createSkillsTools(fakePorts());
    expect(tools.map((t) => t.name)).toEqual([
      'create_skill',
      'list_skills',
      'delete_skill',
      'install_skill',
      'search_skills',
    ]);
    for (const t of tools) {
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  test('operations arrays are exact', () => {
    const byName = new Map(createSkillsTools(fakePorts()).map((t) => [t.name, t]));
    expect(byName.get('create_skill')?.operations).toEqual(['fs.write']);
    expect(byName.get('list_skills')?.operations).toBeUndefined();
    expect(byName.get('delete_skill')?.operations).toEqual(['fs.write']);
    expect(byName.get('install_skill')?.operations).toEqual(['network', 'fs.write']);
    expect(byName.get('search_skills')?.operations).toEqual(['network']);
  });

  test('orgId and actor pass through from scope and ctx', async () => {
    const ports = fakePorts();
    const byName = new Map(createSkillsTools(ports).map((t) => [t.name, t]));
    await byName
      .get('create_skill')
      ?.execute({ name: 'a', description: 'd', instructions: 'i' }, ctx);
    await byName.get('list_skills')?.execute({}, ctx);
    await byName.get('delete_skill')?.execute({ name: 'a' }, ctx);
    await byName.get('install_skill')?.execute({ source: 'owner/repo' }, ctx);
    await byName.get('search_skills')?.execute({ query: 'pdf' }, ctx);
    expect(ports.calls).toEqual([
      { orgId: 'org-1', actor: 'agent:agent-9' },
      { orgId: 'org-1' },
      { orgId: 'org-1', name: 'a' },
      { orgId: 'org-1', actor: 'agent:agent-9', source: 'owner/repo' },
      { query: 'pdf' },
    ]);
  });

  test('list_skills returns compact entries without bodies', async () => {
    const byName = new Map(createSkillsTools(fakePorts()).map((t) => [t.name, t]));
    const result = (await byName.get('list_skills')?.execute({}, ctx)) as {
      skills: Record<string, unknown>[];
    };
    expect(result.skills).toEqual([
      { name: 'my-skill', origin: 'org' },
      { name: 'automations', origin: 'system' },
      { name: 'repo-skill', origin: 'source:acme/repo', installedFrom: 'acme/repo' },
    ]);
  });

  test('delete_skill refusal passes the use-case error through', async () => {
    const ports = fakePorts({
      deleteSkill: () =>
        Promise.reject(new Error('skill is managed outside the organization: system')),
    });
    const byName = new Map(createSkillsTools(ports).map((t) => [t.name, t]));
    const result = await byName.get('delete_skill')?.execute({ name: 'automations' }, ctx);
    expect(result).toEqual({ error: 'skill is managed outside the organization: system' });
  });

  test('delete_skill returns the deleted name', async () => {
    const byName = new Map(createSkillsTools(fakePorts()).map((t) => [t.name, t]));
    const result = await byName.get('delete_skill')?.execute({ name: 'my-skill' }, ctx);
    expect(result).toEqual({ deleted: 'my-skill' });
  });

  test('search_skills truncates to ten by default and counts the rest', async () => {
    const results = Array.from({ length: 12 }, (_, i) => ({ name: `s${i}` }));
    const byName = new Map(
      createSkillsTools(fakePorts({ searchSkills: () => Promise.resolve({ results }) })).map(
        (t) => [t.name, t],
      ),
    );
    const out = (await byName.get('search_skills')?.execute({ query: 'pdf' }, ctx)) as {
      results: unknown[];
      more?: number;
    };
    expect(out.results).toHaveLength(10);
    expect(out.more).toBe(2);
  });

  test('search_skills honours limit and keeps degraded and hint', async () => {
    const results = Array.from({ length: 4 }, (_, i) => ({ name: `s${i}` }));
    const byName = new Map(
      createSkillsTools(
        fakePorts({
          searchSkills: () => Promise.resolve({ results, degraded: true, hint: 'slow' }),
        }),
      ).map((t) => [t.name, t]),
    );
    const out = (await byName.get('search_skills')?.execute({ query: 'pdf', limit: 3 }, ctx)) as {
      results: unknown[];
      more?: number;
      degraded?: boolean;
      hint?: string;
    };
    expect(out.results).toHaveLength(3);
    expect(out.more).toBe(1);
    expect(out.degraded).toBe(true);
    expect(out.hint).toBe('slow');
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
    const listResult = await byName.get('list_skills')?.execute({}, ctx);
    expect(listResult).toEqual({ error: 'organization scope is not available' });
    const deleteResult = await byName.get('delete_skill')?.execute({ name: 'a' }, ctx);
    expect(deleteResult).toEqual({ error: 'organization scope is not available' });
    expect(ports.calls.filter((c) => c.orgId !== undefined)).toEqual([]);
  });
});
