import { describe, expect, test } from 'bun:test';
import type { SkillDocument } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { createLoadSkillTool } from './create-load-skill-tool.ts';

function registryOf(doc: SkillDocument): SkillRegistry {
  return {
    list: () => [{ name: doc.name, description: doc.description }],
    load: (id: string) => {
      if (id !== doc.name) {
        throw new Error(`unknown skill: ${id}`);
      }
      return doc;
    },
    loadFile: (id: string, relPath: string) => ({ path: relPath, content: `${id}:${relPath}` }),
    reload: () => undefined,
  };
}

const DOC: SkillDocument = {
  name: 'automations',
  description: 'Trigger management',
  instructions: 'BODY',
  files: ['references/gates.md'],
};

const EMPTY = registryOf({ name: 'other', description: 'other', instructions: '' });

async function load(registry: SkillRegistry, name: string, installed?: SkillRegistry) {
  const toolDefinition = createLoadSkillTool(
    registry,
    installed === undefined ? {} : { installed },
  );
  return await toolDefinition.execute({ name }, { cwd: '/', paths: { allow: [] } });
}

describe('load_skill', () => {
  test('returns instructions and the file list', async () => {
    const result = await load(registryOf(DOC), 'automations');
    expect(result).toEqual({ instructions: 'BODY', files: ['references/gates.md'] });
  });

  test('explains a skill that is installed but not enabled for the agent', async () => {
    const result = await load(EMPTY, 'automations', registryOf(DOC));
    expect(result).toMatchObject({ error: true, code: 'SKILL_NOT_ENABLED' });
  });

  test('stays UNKNOWN_SKILL when the skill is not installed at all', async () => {
    const result = await load(EMPTY, 'missing', EMPTY);
    expect(result).toMatchObject({ error: true, code: 'UNKNOWN_SKILL' });
  });
});
