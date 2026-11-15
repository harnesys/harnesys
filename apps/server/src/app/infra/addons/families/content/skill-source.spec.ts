import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeLayout } from '../../catalog/fake-layout.ts';
import { OrgSkillContributionAdapter } from '../../storage/org-skill-contribution.adapter.ts';
import { FakeLogger } from '../testing/fakes.ts';
import {
  ADDON_SKILL_MAX_FILES,
  addonSkillName,
  collectAddonSkillFiles,
  parseAddonSkillDocument,
  resolveContentSkillPath,
} from './skill-source.ts';

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeSkill(dir: string, frontmatter: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}\n`, 'utf8');
}

function writeRef(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(join(dir, 'references', name), content, 'utf8');
}

describe('addon skill frontmatter', () => {
  test('reads description and when_to_use, tolerates their absence and broken yaml', () => {
    const withWhen = parseAddonSkillDocument(
      '---\nname: a\ndescription: A skill\nwhen_to_use: when A\n---\nHello\n',
    );
    expect(withWhen).toEqual({ description: 'A skill', whenToUse: 'when A', body: 'Hello' });

    const withoutWhen = parseAddonSkillDocument('---\nname: b\ndescription: B skill\n---\nBody\n');
    expect(withoutWhen).toEqual({ description: 'B skill', body: 'Body' });

    const broken = parseAddonSkillDocument('---\nname: [unclosed\n---\nText\n');
    expect(broken.description).toBeUndefined();
    expect(broken.whenToUse).toBeUndefined();
    expect(broken.body).toBe('Text');
  });
});

describe('content skill path resolution', () => {
  test('accepts a skill directory and a legacy SKILL.md file, refuses escapes and missing paths', () => {
    const root = tempDir('content-root-');
    writeSkill(join(root, 'content', 'guide'), 'name: g\ndescription: G', 'Body');

    const dir = resolveContentSkillPath(root, 'content/guide');
    expect(dir.ok).toBe(true);
    if (dir.ok) {
      expect(dir.location.mode).toBe('dir');
      expect(dir.location.source).toBe(join(root, 'content', 'guide'));
      expect(dir.location.skillFile).toBe(join(root, 'content', 'guide', 'SKILL.md'));
    }

    const file = resolveContentSkillPath(root, 'content/guide/SKILL.md');
    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.location.mode).toBe('file');
    }

    expect(resolveContentSkillPath(root, '../escape').ok).toBe(false);
    expect(resolveContentSkillPath(root, '/etc/passwd').ok).toBe(false);
    expect(resolveContentSkillPath(root, 'content/missing').ok).toBe(false);
  });
});

describe('addon skill file caps', () => {
  test('refuses oversized files, too many files, an over-total budget, and skips symlinks', () => {
    const big = join(tempDir('content-big-'), 'guide');
    writeSkill(big, 'name: g\ndescription: G', 'Body');
    writeRef(big, 'huge.md', 'x'.repeat(300 * 1024));
    const oversized = collectAddonSkillFiles(big);
    expect(oversized.ok).toBe(false);

    const many = join(tempDir('content-many-'), 'guide');
    writeSkill(many, 'name: g\ndescription: G', 'Body');
    for (let i = 0; i < ADDON_SKILL_MAX_FILES + 1; i += 1) {
      writeRef(many, `f${i}.md`, 'x');
    }
    expect(collectAddonSkillFiles(many).ok).toBe(false);

    const total = join(tempDir('content-total-'), 'guide');
    writeSkill(total, 'name: g\ndescription: G', 'Body');
    for (let i = 0; i < 8; i += 1) {
      writeRef(total, `f${i}.md`, 'x'.repeat(200 * 1024));
    }
    expect(collectAddonSkillFiles(total).ok).toBe(false);

    const linked = join(tempDir('content-link-'), 'guide');
    writeSkill(linked, 'name: g\ndescription: G', 'Body');
    mkdirSync(join(linked, 'references'), { recursive: true });
    symlinkSync(join(linked, 'SKILL.md'), join(linked, 'references', 'link.md'));
    const collected = collectAddonSkillFiles(linked);
    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.skipped).toEqual(['references/link.md']);
      expect(collected.files['references/link.md']).toBeUndefined();
    }
  });
});

describe('OrgSkillContributionAdapter', () => {
  test('copies SKILL.md with frontmatter and references into the namespaced org skill dir', () => {
    const layout = new FakeLayout();
    const adapter = new OrgSkillContributionAdapter(layout, new FakeLogger());
    const source = join(tempDir('content-src-'), 'guide');
    writeSkill(
      source,
      'name: guide\ndescription: Pack guide\nwhen_to_use: when guiding',
      'Body line',
    );
    writeRef(source, 'deep.md', 'deep content');

    const disposable = adapter.register('org-1', 'acme.test', {
      skillId: 'guide',
      title: 'Guide fallback',
      sourcePath: source,
    });

    const dest = join(layout.skillsDir('org-1'), addonSkillName('acme.test', 'guide'));
    expect(existsSync(dest)).toBe(true);
    const markdown = readFileSync(join(dest, 'SKILL.md'), 'utf8');
    expect(markdown).toContain('name: "addon-acme-test-guide"');
    expect(markdown).toContain('description: "Pack guide"');
    expect(markdown).toContain('when_to_use: "when guiding"');
    expect(markdown).toContain('Body line');
    expect(existsSync(join(dest, 'references'))).toBe(true);
    expect(readFileSync(join(dest, 'references', 'deep.md'), 'utf8')).toBe('deep content');

    disposable.dispose();
    expect(existsSync(dest)).toBe(false);
  });
});
