import { describe, expect, test } from 'bun:test';
import type { PackSkill } from '../../domain/pack.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { combineSkillRegistries } from './combined-skills.ts';

function fsRegistry(): SkillRegistry {
  return {
    list: () => [{ name: 'shared', description: 'fs' }],
    load: () => ({
      name: 'shared',
      description: 'fs',
      instructions: 'fs body',
      files: ['references/fs.md'],
    }),
    loadFile: (id: string, relPath: string) => ({ path: relPath, content: `fs:${id}:${relPath}` }),
    reload: () => {},
  };
}

const packSkill: PackSkill = {
  name: 'shared',
  description: 'pack',
  whenToUse: 'when packing',
  body: 'pack body',
  files: { 'references/pack.md': 'pack file content' },
};

describe('combineSkillRegistries pack skills', () => {
  test('load exposes the pack supporting-file list', async () => {
    const registry = combineSkillRegistries(undefined, [packSkill]);
    const doc = (await registry.load('shared')) as { instructions: string; files?: string[] };
    expect(doc.instructions).toBe('pack body');
    expect(doc.files).toEqual(['references/pack.md']);
  });

  test('loadFile prefers pack files over the fs registry', async () => {
    const registry = combineSkillRegistries(fsRegistry(), [packSkill]);
    const file = await registry.loadFile('shared', 'references/pack.md');
    expect(file.content).toBe('pack file content');
    const other = await registry.loadFile('shared', 'references/fs.md');
    expect(other.content).toBe('fs:shared:references/fs.md');
  });

  test('loadFile reports an unknown pack-only file', () => {
    const registry = combineSkillRegistries(undefined, [packSkill]);
    expect(() => registry.loadFile('shared', 'references/missing.md')).toThrow(
      'unknown skill file: shared/references/missing.md',
    );
  });
});
