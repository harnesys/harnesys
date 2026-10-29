import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsSkillRegistry } from './fs-skill-registry.ts';

const root = mkdtempSync(join(tmpdir(), 'fs-skill-registry-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeFile(path: string, content: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}

function skillMarkdown(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\nBody of ${name}.\n`;
}

writeFile('root-skills/alpha/SKILL.md', skillMarkdown('alpha', 'root skill'));
writeFile('deep/nested/my-skill/SKILL.md', skillMarkdown('my-skill', 'nested skill'));
writeFile('deep/nested/my-skill/notes.md', 'some notes');
writeFile('deep/nested/my-skill/.harnesys-skill.json', '{"url":"https://example.com/repo"}');
writeFile('deep/nested/my-skill/.hidden/file.md', 'hidden dir');
writeFile('deep/nested/my-skill/.hidden-file.md', 'hidden file');
writeFile('other/alpha/SKILL.md', skillMarkdown('alpha', 'override'));

describe('FsSkillRegistry', () => {
  test('roots behavior unchanged', () => {
    const registry = new FsSkillRegistry({ roots: [join(root, 'root-skills')] });
    expect(registry.list().map((s) => s.name)).toEqual(['alpha']);
  });

  test('skillDirs indexes explicit dirs; later entries override roots and earlier dirs', () => {
    const registry = new FsSkillRegistry({
      roots: [join(root, 'root-skills')],
      skillDirs: [join(root, 'deep/nested/my-skill'), join(root, 'other/alpha')],
    });
    expect(
      registry
        .list()
        .map((s) => s.name)
        .sort(),
    ).toEqual(['alpha', 'my-skill']);
    expect(registry.load('my-skill')).toMatchObject({ description: 'nested skill' });
    expect(registry.load('alpha')).toMatchObject({ description: 'override' });
  });

  test('loadFile works for explicit skillDir files, including dot paths', () => {
    const registry = new FsSkillRegistry({
      roots: [],
      skillDirs: [join(root, 'deep/nested/my-skill')],
    });
    expect(registry.loadFile('my-skill', 'notes.md')).toEqual({
      path: 'notes.md',
      content: 'some notes',
    });
    expect(registry.loadFile('my-skill', '.harnesys-skill.json')).toEqual({
      path: '.harnesys-skill.json',
      content: '{"url":"https://example.com/repo"}',
    });
  });

  test('dot-named files and dirs are hidden from load_skill files list', () => {
    const registry = new FsSkillRegistry({
      roots: [],
      skillDirs: [join(root, 'deep/nested/my-skill')],
    });
    const doc = registry.load('my-skill') as { files: string[] };
    expect(doc.files).toEqual(['notes.md']);
  });

  test('skillDirs entry without SKILL.md is ignored', () => {
    const registry = new FsSkillRegistry({ roots: [], skillDirs: [join(root, 'root-skills')] });
    expect(registry.list()).toEqual([]);
  });
});
