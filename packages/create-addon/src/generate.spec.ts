import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAddonManifest } from '@harnesys/sdk';
import { syncTemplate } from '../scripts/sync-template.ts';
import { type GenerateInput, generateAddon } from './generate.ts';

interface JsonFile {
  name?: string;
  extends?: string;
  dependencies?: Record<string, string>;
}

const templateDir = join(import.meta.dir, '..', 'template');
const input: GenerateInput = {
  id: 'acme.demo',
  title: 'Demo',
  sdk: '^1.0.0',
  builtin: false,
  dir: '',
  force: false,
  templateDir,
};

const created: string[] = [];

beforeAll(() => {
  syncTemplate();
});

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'create-addon-'));
  created.push(dir);
  return dir;
}

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const nested of listFiles(join(dir, entry.name), rel)) {
        out.push(nested);
      }
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function readJson(file: string): JsonFile {
  return JSON.parse(readFileSync(file, 'utf8')) as JsonFile;
}

function expectedTemplateFiles(): string[] {
  return listFiles(templateDir)
    .map((file) => (file === 'gitignore' ? '.gitignore' : file))
    .sort();
}

describe('generateAddon', () => {
  test('guards the target directory and a missing template', () => {
    const dir = tempDir();
    expect(() => generateAddon({ ...input, dir, templateDir: join(dir, 'missing') })).toThrow(
      /sync-template/,
    );
    expect(generateAddon({ ...input, dir }).files.length).toBeGreaterThan(0);
    expect(() => generateAddon({ ...input, dir })).toThrow(/not empty/);
    expect(() => generateAddon({ ...input, dir, force: true })).not.toThrow();
  });

  test('refuses to overwrite a repository, the current directory or the home directory', () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'addon.json'), '{}');
    expect(() => generateAddon({ ...input, dir: repo, force: true })).toThrow(/contains .git/);

    const parent = tempDir();
    mkdirSync(join(parent, 'child'), { recursive: true });
    writeFileSync(join(parent, 'child', 'keep.txt'), 'keep');
    const cwd = process.cwd();
    process.chdir(join(parent, 'child'));
    try {
      expect(() => generateAddon({ ...input, dir: parent, force: true })).toThrow(
        /current directory/,
      );
    } finally {
      process.chdir(cwd);
    }
  });

  test('copies the whole template tree and drops every acme.example placeholder', () => {
    const dir = tempDir();
    const { files } = generateAddon({ ...input, dir });
    expect(files).toEqual(expectedTemplateFiles());
    expect(files).toContain('.gitignore');
    expect(files).toContain('content/usage/SKILL.md');
    expect(files).toContain('migrations/0001_init.sql');
    for (const file of files) {
      expect(readFileSync(join(dir, file), 'utf8').includes('acme.example')).toBe(false);
    }
  });

  test('substitutes the SDK range and the builtin wiring', () => {
    const external = tempDir();
    generateAddon({ ...input, dir: external, sdk: '^2.3.4' });
    const externalPkg = readJson(join(external, 'package.json'));
    expect(externalPkg.name).toBe('acme.demo');
    expect(externalPkg.dependencies?.['@harnesys/sdk']).toBe('^2.3.4');

    const builtin = tempDir();
    generateAddon({ ...input, dir: builtin, builtin: true });
    const builtinPkg = readJson(join(builtin, 'package.json'));
    expect(builtinPkg.dependencies?.['@harnesys/sdk']).toBe('file:../../packages/sdk');
    expect(readJson(join(builtin, 'tsconfig.json')).extends).toBe('../../tsconfig.json');
  });

  test('the generated manifest passes parseAddonManifest', () => {
    const dir = tempDir();
    generateAddon({ ...input, dir });
    const raw: unknown = JSON.parse(readFileSync(join(dir, 'addon.json'), 'utf8'));
    const manifest = parseAddonManifest(raw);
    expect(manifest.id).toBe('acme.demo');
    expect(manifest.title).toBe('Demo');
  });
});
