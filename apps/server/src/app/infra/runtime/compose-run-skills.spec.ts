import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillRegistry, SkillSummary } from 'harnesys';
import { composeSkillRegistries } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import type { SourceSkillDir, SourceSkillsScan } from '../../domain/skills/source-skills.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { composeRunSkills } from './compose-run-skills.ts';

const root = mkdtempSync(join(tmpdir(), 'compose-run-skills-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeSkill(dir: string, name: string, description: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody of ${name}.\n`,
  );
  return dir;
}

class FakeDiscovery extends SourceSkillsPort {
  private readonly byRoot = new Map<string, SourceSkillDir[]>();

  add(root: string, dirs: SourceSkillDir[]): void {
    this.byRoot.set(root, dirs);
  }

  scan(dirRoot: string): Promise<SourceSkillsScan> {
    return Promise.resolve({ skillDirs: this.byRoot.get(dirRoot) ?? [], agentMarkdownPaths: [] });
  }

  invalidate(): void {}
}

function summaryOf(registry: SkillRegistry, name: string): Promise<SkillSummary | undefined> {
  return Promise.resolve(registry.list()).then((rows) => rows.find((row) => row.name === name));
}

function tier(body: string): SkillRegistry {
  const _dir = writeSkill(join(root, body, 'shared'), 'shared', body);
  return new FsSkillRegistry({ roots: [join(root, body)] });
}

function stubRegistry(
  entries: Record<string, { description: string; body: string }>,
): SkillRegistry {
  return {
    list: () =>
      Promise.resolve(
        Object.keys(entries).map((name) => ({
          name,
          description: entries[name]?.description ?? '',
        })),
      ),
    load: (id) => Promise.resolve(entries[id]?.body ?? ''),
    loadFile: (id) => Promise.resolve({ path: 'SKILL.md', content: entries[id]?.body ?? '' }),
    reload: () => Promise.resolve(),
  };
}

describe('composeRunSkills', () => {
  test('name priority: source > org > host > system', async () => {
    const orgSkills = composeSkillRegistries([tier('system'), tier('host'), tier('org')]);
    const sourceDir = writeSkill(join(root, 'src-a'), 'shared', 'source-body');
    const discovery = new FakeDiscovery();
    discovery.add(join(root, 'src-root'), [
      { dir: sourceDir, relativePath: 'a', outsideContainer: false },
    ]);
    const skills = await composeRunSkills({
      orgSkills,
      discovery,
      sources: [{ id: 's1', name: 'alpha', root: join(root, 'src-root') }],
      autoLoad: true,
    });
    expect((await summaryOf(skills, 'shared'))?.description).toBe('source-body');
  });

  test('autoLoad false keeps the org bundle unchanged', async () => {
    const _orgDir = writeSkill(join(root, 'org-tier', 'skill'), 'org-only', 'org-only');
    const orgSkills = composeSkillRegistries([
      new FsSkillRegistry({ roots: [join(root, 'org-tier')] }),
    ]);
    const sourceDir = writeSkill(join(root, 'src-b'), 'source-skill', 'source-body');
    const discovery = new FakeDiscovery();
    discovery.add(join(root, 'src-root'), [
      { dir: sourceDir, relativePath: 'b', outsideContainer: false },
    ]);
    const skills = await composeRunSkills({
      orgSkills,
      discovery,
      sources: [{ id: 's1', name: 'alpha', root: join(root, 'src-root') }],
      autoLoad: false,
    });
    expect(await summaryOf(skills, 'source-skill')).toBeUndefined();
    expect((await summaryOf(skills, 'org-only'))?.description).toBe('org-only');
  });

  test('two sources with the same name: later by name sort wins', async () => {
    const dirB = writeSkill(join(root, 'src-zeta'), 'clash', 'zeta-body');
    const dirA = writeSkill(join(root, 'src-alpha'), 'clash', 'alpha-body');
    const discovery = new FakeDiscovery();
    discovery.add(join(root, 'zeta-root'), [
      { dir: dirB, relativePath: 'z', outsideContainer: false },
    ]);
    discovery.add(join(root, 'alpha-root'), [
      { dir: dirA, relativePath: 'a', outsideContainer: false },
    ]);
    const skills = await composeRunSkills({
      orgSkills: composeSkillRegistries([]),
      discovery,
      sources: [
        { id: 's2', name: 'zeta', root: join(root, 'zeta-root') },
        { id: 's1', name: 'alpha', root: join(root, 'alpha-root') },
      ],
      autoLoad: true,
    });
    expect((await summaryOf(skills, 'clash'))?.description).toBe('zeta-body');
  });

  test('plugin-prefixed names stay resolvable from the org bundle', async () => {
    const orgSkills = stubRegistry({
      'plugin:demo:helper': { description: 'plugin:demo:helper', body: 'plugin-body' },
    });
    const sourceDir = writeSkill(join(root, 'src-c'), 'helper', 'source-body');
    const discovery = new FakeDiscovery();
    discovery.add(join(root, 'src-root'), [
      { dir: sourceDir, relativePath: 'c', outsideContainer: false },
    ]);
    const skills = await composeRunSkills({
      orgSkills,
      discovery,
      sources: [{ id: 's1', name: 'alpha', root: join(root, 'src-root') }],
      autoLoad: true,
    });
    expect((await summaryOf(skills, 'plugin:demo:helper'))?.description).toBe('plugin:demo:helper');
    expect((await summaryOf(skills, 'helper'))?.description).toBe('source-body');
  });
});
