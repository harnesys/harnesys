import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
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
