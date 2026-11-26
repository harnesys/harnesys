import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { moveFileTool } from './move-file.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'harnesys-move-file-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(fileAccess?: FileAccessPolicy): ToolContext {
  return { cwd: root, paths: { allow: [] }, ...(fileAccess ? { fileAccess } : {}) };
}

describe('move_file', () => {
  test('moves a file and creates the target parent directory', async () => {
    const source = join(root, 'raw.txt');
    writeFileSync(source, 'payload\n');
    const def = moveFileTool();
    await expect(
      def.execute({ from: 'raw.txt', to: 'src/moved.txt' }, ctx()),
    ).resolves.toMatchObject({ moved: 1 });
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(join(root, 'src/moved.txt'), 'utf8')).toBe('payload\n');
  });

  test('existing target is refused without explicit overwrite: true', async () => {
    writeFileSync(join(root, 'a.txt'), 'a\n');
    writeFileSync(join(root, 'b.txt'), 'b\n');
    const def = moveFileTool();
    await expect(def.execute({ from: 'a.txt', to: 'b.txt' }, ctx())).rejects.toThrow(
      'Target exists; pass overwrite: true',
    );
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('b\n');
    await expect(
      def.execute({ from: 'a.txt', to: 'b.txt', overwrite: true }, ctx()),
    ).resolves.toMatchObject({ moved: 1 });
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('a\n');
  });

  test('denied target path keeps the source in place', async () => {
    writeFileSync(join(root, 'keep.txt'), 'keep\n');
    const denyVault: FileAccessPolicy = ({ path }) =>
      path.includes('vault') ? { decision: 'deny', reason: 'test rule' } : { decision: 'allow' };
    const def = moveFileTool();
    await expect(
      def.execute({ from: 'keep.txt', to: 'vault/keep.txt' }, ctx(denyVault)),
    ).rejects.toThrow('File access denied');
    expect(existsSync(join(root, 'keep.txt'))).toBe(true);
    mkdirSync(join(root, 'vault'), { recursive: true });
    expect(existsSync(join(root, 'vault/keep.txt'))).toBe(false);
  });

  test('gate asks when either path is outside the grant', () => {
    const mixed: FileAccessPolicy = ({ path }) =>
      path.endsWith('out.txt') ? { decision: 'ask' } : { decision: 'allow' };
    const def = moveFileTool();
    const gate = def.gate?.(
      { from: 'in.txt', to: 'out.txt' },
      { cwd: root, paths: {}, fileAccess: mixed },
    );
    expect(gate?.decision).toBe('ask');
  });
});
