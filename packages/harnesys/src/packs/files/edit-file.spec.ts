import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolContext } from '../../ports/tools.ts';
import { editFileTool } from './edit-file.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'harnesys-edit-file-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(): ToolContext {
  return { cwd: root, paths: { allow: [] } };
}

describe('edit_file concurrency', () => {
  test('parallel batch of 3 edits to one file applies all replacements', async () => {
    const file = join(root, 'batch.md');
    writeFileSync(file, 'alpha\nbeta\ngamma\n');
    const def = editFileTool();
    const outcomes = await Promise.allSettled([
      def.execute({ path: file, old_string: 'alpha', new_string: 'ALPHA' }, ctx()),
      def.execute({ path: file, old_string: 'beta', new_string: 'BETA' }, ctx()),
      def.execute({ path: file, old_string: 'gamma', new_string: 'GAMMA' }, ctx()),
    ]);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('fulfilled');
    }
    expect(readFileSync(file, 'utf8')).toBe('ALPHA\nBETA\nGAMMA\n');
  });

  test('edit whose old_string is removed by a concurrent edit fails instead of returning ok', async () => {
    const file = join(root, 'chain.md');
    writeFileSync(file, 'one\ntwo\n');
    const def = editFileTool();
    const outcomes = await Promise.allSettled([
      def.execute({ path: file, old_string: 'one\ntwo', new_string: 'only' }, ctx()),
      def.execute({ path: file, old_string: 'two', new_string: 'TWO' }, ctx()),
    ]);
    expect(outcomes[0]?.status).toBe('fulfilled');
    expect(outcomes[1]?.status).toBe('rejected');
    const reason = (outcomes[1] as PromiseRejectedResult).reason;
    expect(String(reason)).toContain('old_string not found');
    expect(readFileSync(file, 'utf8')).toBe('only\n');
  });
});
