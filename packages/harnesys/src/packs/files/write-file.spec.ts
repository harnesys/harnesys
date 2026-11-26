import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolContext } from '../../ports/tools.ts';
import { writeFileTool } from './write-file.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'harnesys-write-file-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(): ToolContext {
  return { cwd: root, paths: { allow: [] } };
}

describe('write_file concurrency', () => {
  test('parallel create with overwrite false lets exactly one call win', async () => {
    const file = join(root, 'claim.lock');
    const def = writeFileTool();
    const outcomes = await Promise.allSettled([
      def.execute({ path: file, content: 'first', overwrite: false }, ctx()),
      def.execute({ path: file, content: 'second', overwrite: false }, ctx()),
    ]);
    expect(outcomes[0]?.status).toBe('fulfilled');
    expect(outcomes[1]?.status).toBe('rejected');
    const reason = (outcomes[1] as PromiseRejectedResult).reason;
    expect(String(reason)).toContain('File exists and overwrite is false');
  });
});

describe('write_file batch', () => {
  test('files batch writes entries and reports per-item failures', async () => {
    const def = writeFileTool();
    const result = (await def.execute(
      {
        files: [
          { path: 'docs/a.md', content: 'a' },
          { path: '.env', content: 'secret' },
          { path: 'docs/b.md', content: 'b', overwrite: false },
        ],
      },
      ctx(),
    )) as { written: number; failed: Array<{ path: string; error: string }> };
    expect(result.written).toBe(2);
    expect(result.failed.map((f) => f.path)).toEqual(['.env']);
    expect(readFileSync(join(root, 'docs/a.md'), 'utf8')).toBe('a');
    expect(readFileSync(join(root, 'docs/b.md'), 'utf8')).toBe('b');
    expect(existsSync(join(root, '.env'))).toBe(false);
  });

  test('single mode keeps the original result shape', async () => {
    const def = writeFileTool();
    await expect(def.execute({ path: 'single.md', content: 'x' }, ctx())).resolves.toEqual({
      path: 'single.md',
      bytes: 1,
      created: true,
    });
    await expect(
      def.execute({ path: 'single.md', content: 'x', files: [] }, ctx()),
    ).rejects.toThrow('Provide either path/content or files, not both');
  });
});
