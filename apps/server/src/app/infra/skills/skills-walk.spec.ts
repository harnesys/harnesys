import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkSkills } from './skills-walk.ts';
import { SourceSkillsAdapter } from './source-skills.adapter.ts';

let rootSeq = 0;

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), `skills-walk-${process.pid}-${rootSeq++}-`));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function skill(dir: string, name: string, description = `${name} description`): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
  );
}

function ag(dir: string, file: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), content);
}

describe('walkSkills', () => {
  test('finds container skill with outsideContainer false', async () => {
    const root = join(base, 'r1');
    skill(join(root, 'skills', 'react-x'), 'react-x');
    const res = await walkSkills(root);
    const hit = res.candidates.find((c) => c.name === 'react-x');
    expect(hit?.outsideContainer).toBe(false);
    expect(hit?.relativePath).toBe('skills/react-x');
  });

  test('finds root skill', async () => {
    const root = join(base, 'r2');
    skill(root, 'root-skill');
    const res = await walkSkills(root);
    expect(res.candidates.some((c) => c.name === 'root-skill' && c.relativePath === '')).toBe(true);
  });

  test('finds multi-repo skill outside containers', async () => {
    const root = join(base, 'r3');
    skill(join(root, 'packages', 'foo', '.agents', 'skills', 'bar'), 'bar');
    const res = await walkSkills(root);
    const hit = res.candidates.find((c) => c.name === 'bar');
    expect(hit?.outsideContainer).toBe(true);
    expect(hit?.relativePath).toBe('packages/foo/.agents/skills/bar');
  });

  test('gitignore listing .agents/ does not hide skills', async () => {
    const root = join(base, 'r4');
    skill(join(root, '.agents', 'skills', 'kept'), 'kept');
    ag(root, '.gitignore', '.agents/\n');
    const res = await walkSkills(root);
    expect(res.candidates.some((c) => c.name === 'kept')).toBe(true);
  });

  test('node_modules and safety names are skipped', async () => {
    const root = join(base, 'r5');
    skill(join(root, 'node_modules', 'x'), 'x-skill');
    const res = await walkSkills(root);
    expect(res.candidates.some((c) => c.name === 'x-skill')).toBe(false);
  });

  test('harnesysignore is respected', async () => {
    const root = join(base, 'r6');
    skill(join(root, 'secret', 's'), 'secret-skill');
    ag(root, '.harnesysignore', 'secret/\n');
    const res = await walkSkills(root);
    expect(res.candidates.some((c) => c.name === 'secret-skill')).toBe(false);
  });

  test('name collision: container wins', async () => {
    const root = join(base, 'r7');
    skill(join(root, 'skills', 'dup'), 'dup');
    skill(join(root, 'deep', 'nested', 'dup'), 'dup');
    const res = await walkSkills(root);
    const winner = res.candidates.find((c) => c.name === 'dup' && c.invalidReason === undefined);
    expect(winner?.relativePath).toBe('skills/dup');
    const loser = res.candidates.find((c) => c.invalidReason === 'duplicate-name');
    expect(loser?.relativePath).toBe('deep/nested/dup');
  });

  test('broken frontmatter yields invalidReason', async () => {
    const root = join(base, 'r8');
    ag(join(root, 'broken'), 'SKILL.md', 'not frontmatter at all');
    const res = await walkSkills(root);
    const hit = res.candidates.find((c) => c.relativePath === 'broken');
    expect(hit?.invalidReason).toBeDefined();
  });

  test('AGENTS.md collected without becoming candidate', async () => {
    const root = join(base, 'r9');
    ag(join(root, 'docs'), 'AGENTS.md', '# agents');
    const res = await walkSkills(root);
    expect(res.agentMarkdownPaths).toEqual([join(root, 'docs', 'AGENTS.md')]);
    expect(res.candidates).toEqual([]);
  });

  test('symlink cycle terminates', async () => {
    const root = join(base, 'r10');
    const loop = join(root, 'loop');
    skill(loop, 'loop-skill');
    symlinkSync(loop, join(loop, 'self'));
    const res = await walkSkills(root);
    expect(res.candidates.some((c) => c.name === 'loop-skill')).toBe(true);
  });

  test('entry budget and caps do not explode', async () => {
    const root = join(base, 'r11');
    for (let i = 0; i < 600; i++) {
      skill(join(root, 'bulk', `s${i}`), `s${i}`);
    }
    const res = await walkSkills(root);
    const valid = res.candidates.filter((c) => c.invalidReason === undefined);
    expect(valid.length).toBeLessThanOrEqual(500);
  });
});

describe('SourceSkillsAdapter', () => {
  test('scan caches, invalidate rescans, ttl expiry rescans', async () => {
    const root = join(base, 'c1');
    skill(join(root, 'skills', 'one'), 'one');
    const adapter = new SourceSkillsAdapter();
    const first = await adapter.scan(root);
    expect(first.skillDirs.map((d) => d.relativePath)).toEqual(['skills/one']);
    skill(join(root, 'skills', 'two'), 'two');
    const cached = await adapter.scan(root);
    expect(cached).toBe(first);
    adapter.invalidate(root);
    const fresh = await adapter.scan(root);
    expect(fresh.skillDirs.map((d) => d.relativePath)).toEqual(['skills/one', 'skills/two']);
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      skill(join(root, 'skills', 'three'), 'three');
      const expired = await adapter.scan(root);
      expect(expired.skillDirs.map((d) => d.relativePath)).toEqual([
        'skills/one',
        'skills/three',
        'skills/two',
      ]);
    } finally {
      Date.now = realNow;
    }
  });
});
