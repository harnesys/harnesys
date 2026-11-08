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

describe('edit_file matching fallbacks', () => {
  test('CRLF file keeps CRLF endings after replacement', async () => {
    const file = join(root, 'crlf.md');
    writeFileSync(file, 'one\r\ntwo\r\n');
    const def = editFileTool();
    const result = (await def.execute(
      { path: file, old_string: 'one', new_string: 'ONE' },
      ctx(),
    )) as { path: string };
    expect(result.path).toBe(file);
    expect(readFileSync(file, 'utf8')).toBe('ONE\r\ntwo\r\n');
  });

  test('CRLF old_string still matches an LF file', async () => {
    const file = join(root, 'mixed.md');
    writeFileSync(file, 'one\ntwo\n');
    const def = editFileTool();
    await def.execute({ path: file, old_string: 'one\r\ntwo', new_string: 'only' }, ctx());
    expect(readFileSync(file, 'utf8')).toBe('only\n');
  });

  test('whitespace-tolerant fallback matches with different interior spacing', async () => {
    const file = join(root, 'indent.md');
    writeFileSync(file, 'alpha  =  1\n');
    const def = editFileTool();
    await def.execute({ path: file, old_string: 'alpha = 1', new_string: 'alpha = 2' }, ctx());
    expect(readFileSync(file, 'utf8')).toBe('alpha = 2\n');
  });

  test('inline fragment keeps the text before and after it', async () => {
    const file = join(root, 'fragment.md');
    writeFileSync(file, 'value = alpha(a,   b) + 1;\n');
    const def = editFileTool();
    await def.execute({ path: file, old_string: 'alpha(a, b)', new_string: 'alpha(a, B)' }, ctx());
    expect(readFileSync(file, 'utf8')).toBe('value = alpha(a, B) + 1;\n');
  });

  test('multi-line fallback replaces whole lines and strips their indentation', async () => {
    const file = join(root, 'block.md');
    writeFileSync(file, 'one\n    two\n    three\n');
    const def = editFileTool();
    await def.execute({ path: file, old_string: 'two\nthree', new_string: 'TWO\nTHREE' }, ctx());
    expect(readFileSync(file, 'utf8')).toBe('one\nTWO\nTHREE\n');
  });

  test('whitespace-tolerant match is also ambiguity-checked', async () => {
    const file = join(root, 'ambiguous.md');
    writeFileSync(file, 'x =  1\nx =  1\n');
    const def = editFileTool();
    try {
      await def.execute({ path: file, old_string: 'x = 1', new_string: 'x = 2' }, ctx());
      throw new Error('expected rejection');
    } catch (error) {
      expect(String(error)).toContain('matched 2 times');
    }
    expect(readFileSync(file, 'utf8')).toBe('x =  1\nx =  1\n');
  });

  test('fuzzy replace_all replaces every whitespace-tolerant match', async () => {
    const file = join(root, 'all.md');
    writeFileSync(file, 'x =   1\nx =  1\n');
    const def = editFileTool();
    await def.execute(
      { path: file, old_string: 'x = 1', new_string: 'x = 2', replace_all: true },
      ctx(),
    );
    expect(readFileSync(file, 'utf8')).toBe('x = 2\nx = 2\n');
  });

  test('not-found error keeps its prefix and adds a re-read hint', async () => {
    const file = join(root, 'missing.md');
    writeFileSync(file, 'alpha\n');
    const def = editFileTool();
    try {
      await def.execute({ path: file, old_string: 'alphx', new_string: 'x' }, ctx());
      throw new Error('expected rejection');
    } catch (error) {
      expect(String(error)).toContain('old_string not found in');
      expect(String(error)).toContain('closest existing line');
      expect(String(error)).toContain('alpha');
    }
  });
  test('not-found error points to the closest existing line even with typos', async () => {
    const file = join(root, 'missing.md');
    writeFileSync(file, 'alpha\n| Потоки | Ядро | Инвариант продукта |\n');
    const def = editFileTool();
    try {
      await def.execute(
        { path: file, old_string: '| Потоки | Ядро | Инvariant продукта |', new_string: 'x' },
        ctx(),
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(String(error)).toContain('closest existing line is 2');
      expect(String(error)).toContain('Инвариант');
    }
  });
});

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
