import { describe, expect, test } from 'bun:test';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { PackRegistration, PackSkill } from '../../domain/pack.ts';
import { definePack, registerPack } from '../../domain/pack.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { effectiveSkillRegistry, type PackRunOutput } from './pack-run.ts';
import { packCatalog } from './tool-names.ts';

const tool = (name: string): ToolDefinition => ({
  name,
  description: `${name} tool`,
  input: { type: 'object', properties: {} },
  execute: () => {
    throw new Error('not implemented');
  },
});

const halfWorkingPack: PackRegistration = registerPack(
  definePack({
    name: 'web',
    version: '1.0.0',
    description: 'declares more than a stubbed create returns',
    meta: {
      tools: [
        { name: 'web_search', description: 'search' },
        { name: 'fetch', description: 'fetch' },
        { name: 'browser_open', description: 'open' },
        { name: 'browser_snapshot', description: 'snapshot' },
      ],
      skills: ['browser'],
      hasSettings: false,
    },
    create: () => ({ tools: [tool('web_search'), tool('fetch')] }),
  }),
);

describe('pack catalog', () => {
  test('catalog lists declared meta.tools even when stubbed create returns fewer', () => {
    const entry = packCatalog([halfWorkingPack]).find((candidate) => candidate.name === 'web');
    const names = entry?.tools.map((toolItem) => toolItem.name) ?? [];
    expect(names).toEqual(['web_search', 'fetch', 'browser_open', 'browser_snapshot']);
    expect(entry?.skills).toContain('browser');
  });
});

function fsRegistry(names: string[]): SkillRegistry {
  return {
    list: () => names.map((name) => ({ name, description: 'fs skill' })),
    load: () => {
      throw new Error('not implemented');
    },
    loadFile: () => {
      throw new Error('not implemented');
    },
    reload: () => {},
  };
}

function packOutput(reg: PackRegistration, skills: PackSkill[]): PackRunOutput {
  return { reg, config: {}, tools: [], skills, notes: [] };
}

function defWithSkills(skills: string[]): AgentDefinition {
  return {
    id: 'agent',
    prompts: {},
    graph: {
      nodes: { start: { type: 'core:start' }, end: { type: 'core:end' } },
      edges: [{ from: 'start', to: 'end' }],
    },
    skills,
  };
}

const browserSkill: PackSkill = { name: 'browser', description: 'd', body: 'load me' };

describe('effectiveSkillRegistry', () => {
  test('pack-embedded skills bypass the agent skill allowlist', async () => {
    const registry = effectiveSkillRegistry(
      defWithSkills(['org-skill']),
      fsRegistry(['org-skill', 'other-org']),
      [packOutput(halfWorkingPack, [browserSkill])],
    );
    const names = (await registry.list()).map((skill) => skill.name).sort();
    expect(names).toEqual(['browser', 'org-skill']);
  });

  test('pack skill is loadable by name', async () => {
    const registry = effectiveSkillRegistry(defWithSkills([]), undefined, [
      packOutput(halfWorkingPack, [browserSkill]),
    ]);
    const doc = (await registry.load('browser')) as { instructions: string };
    expect(doc.instructions).toBe('load me');
  });
});
