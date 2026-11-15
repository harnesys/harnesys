import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackSkill } from 'harnesys';
import { FakeLayout } from '../../catalog/fake-layout.ts';
import { OrgSkillContributionAdapter } from '../../storage/org-skill-contribution.adapter.ts';
import { AddonContentRegistry } from '../content/content.family.ts';
import { addonSkillName } from '../content/skill-source.ts';
import { FakeAddonCallPort, FakeLogger, FakePackRegistry, OWNER } from '../testing/fakes.ts';
import { ToolPackFamilyModule } from './tool-pack.family.ts';

function writeSkill(dir: string): void {
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: guide\ndescription: Pack guide\nwhen_to_use: when guiding\n---\nBody line\n',
    'utf8',
  );
  writeFileSync(join(dir, 'references', 'deep.md'), 'deep content', 'utf8');
}

describe('tool-pack pack skills', () => {
  test('emits the content skill with references under the org skill namespaced name', () => {
    const source = join(mkdtempSync(join(tmpdir(), 'pack-skill-')), 'guide');
    writeSkill(source);

    const registry = new AddonContentRegistry();
    registry.add(OWNER, 'guide', {
      owner: OWNER,
      contributionId: 'guide',
      kind: 'skill',
      title: { en: 'Guide' },
      path: 'content/guide',
      resolvedPath: source,
    });

    const packs = new FakePackRegistry();
    const moduleInstance = new ToolPackFamilyModule(
      packs,
      new FakeAddonCallPort(),
      registry,
      new FakeLogger(),
    );
    const disposable = moduleInstance.register(OWNER, {
      name: 'pack',
      title: 'Pack',
      description: 'pack',
      skills: ['guide'],
      tools: [
        {
          name: 'ping',
          description: 'ping',
          inputSchema: { type: 'object', properties: {} },
          effect: 'read',
        },
      ],
    });

    const registration = packs.find('acme.test.pack');
    expect(registration).toBeDefined();
    const create = registration?.pack.create as (() => { skills?: PackSkill[] }) | undefined;
    const skills = create?.().skills ?? [];
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    expect(skill?.name).toBe(addonSkillName(OWNER.addonId, 'guide'));
    expect(skill?.description).toBe('Pack guide');
    expect(skill?.whenToUse).toBe('when guiding');
    expect(skill?.body).toBe('Body line');
    expect(skill?.files?.['references/deep.md']).toBe('deep content');

    const layout = new FakeLayout();
    new OrgSkillContributionAdapter(layout, new FakeLogger()).register(OWNER.orgId, OWNER.addonId, {
      skillId: 'guide',
      title: 'Guide',
      sourcePath: source,
    });
    expect(existsSync(join(layout.skillsDir(OWNER.orgId), skill?.name ?? ''))).toBe(true);

    disposable.dispose();
  });
});
