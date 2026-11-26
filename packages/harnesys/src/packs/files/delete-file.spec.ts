import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { deleteFileTool } from './delete-file.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'harnesys-delete-file-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(fileAccess?: FileAccessPolicy): ToolContext {
  return { cwd: root, paths: { allow: [] }, ...(fileAccess ? { fileAccess } : {}) };
}

function seed(rel: string): string {
  const target = join(root, rel);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, 'x\n');
  return target;
}

describe('delete_file path mode', () => {
  test('deletes a single file', async () => {
    const target = seed('single.txt');
    const def = deleteFileTool();
    await expect(def.execute({ path: 'single.txt' }, ctx())).resolves.toMatchObject({
      deleted: 1,
    });
    expect(existsSync(target)).toBe(false);
  });

  test('directory requires recursive: true', async () => {
    mkdirSync(join(root, 'folder'), { recursive: true });
    seed('folder/inner.txt');
    const def = deleteFileTool();
    await expect(def.execute({ path: 'folder' }, ctx())).rejects.toThrow('Is a directory');
    expect(existsSync(join(root, 'folder'))).toBe(true);
    await expect(def.execute({ path: 'folder', recursive: true }, ctx())).resolves.toMatchObject({
      deleted: 1,
    });
    expect(existsSync(join(root, 'folder'))).toBe(false);
  });

  test('dry_run true on a path reports without deleting', async () => {
    const target = seed('preview.txt');
    const def = deleteFileTool();
    await expect(def.execute({ path: 'preview.txt', dry_run: true }, ctx())).resolves.toMatchObject(
      { kind: 'file', deleted: 0, dry_run: true },
    );
    expect(existsSync(target)).toBe(true);
  });

  test('blocked path is refused', async () => {
    seed('.env');
    const def = deleteFileTool();
    await expect(def.execute({ path: '.env' }, ctx())).rejects.toThrow('Path is blocked');
    expect(existsSync(join(root, '.env'))).toBe(true);
  });

  test('denied file access is refused', async () => {
    const target = seed('guarded.txt');
    const deny: FileAccessPolicy = ({ path }) =>
      path.endsWith('guarded.txt')
        ? { decision: 'deny', reason: 'test rule' }
        : { decision: 'allow' };
    const def = deleteFileTool();
    await expect(def.execute({ path: 'guarded.txt' }, ctx(deny))).rejects.toThrow(
      'File access denied',
    );
    expect(existsSync(target)).toBe(true);
  });
});

describe('delete_file pattern mode', () => {
  test('dry-run by default: matches listed, files kept', async () => {
    seed('dry/a.log');
    seed('dry/b.log');
    const def = deleteFileTool();
    const result = (await def.execute({ pattern: 'dry/*.log' }, ctx())) as {
      matches: string[];
      deleted: number;
      dry_run: boolean;
    };
    expect(result.dry_run).toBe(true);
    expect(result.matches).toEqual(['dry/a.log', 'dry/b.log']);
    expect(result.deleted).toBe(0);
    expect(existsSync(join(root, 'dry/a.log'))).toBe(true);
  });

  test('dry_run: false deletes matches, skips files without write access', async () => {
    seed('wet/a.log');
    seed('wet/b.log');
    const denyB: FileAccessPolicy = ({ path }) =>
      path.endsWith('b.log') ? { decision: 'ask' } : { decision: 'allow' };
    const def = deleteFileTool();
    const result = (await def.execute({ pattern: 'wet/*.log', dry_run: false }, ctx(denyB))) as {
      deleted: number;
      matches: string[];
    };
    expect(result.matches).toEqual(['wet/a.log']);
    expect(result.deleted).toBe(1);
    expect(existsSync(join(root, 'wet/a.log'))).toBe(false);
    expect(existsSync(join(root, 'wet/b.log'))).toBe(true);
  });
});
