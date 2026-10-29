import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { writeDocxTool } from './write-docx.ts';

const allowAll: FileAccessPolicy = () => ({ decision: 'allow' });

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'harnesys-write-docx-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(cwd: string): ToolContext {
  return { cwd, paths: { allow: [], threadDir: path.join(cwd, 'thread') }, fileAccess: allowAll };
}

async function readDocxHtml(target: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({
    buffer: Buffer.from(await Bun.file(target).bytes()),
  });
  return result.value;
}

describe('write_docx tool', () => {
  test('creates a document with headings, paragraphs, bullets and a table', async () => {
    const def = writeDocxTool();
    const target = path.join(root, 'proposal.docx');
    const result = (await def.execute(
      {
        path: target,
        blocks: [
          { type: 'heading', text: 'Proposal', level: 1 },
          { type: 'paragraph', text: 'Introduction paragraph' },
          { type: 'bullet', text: 'First point' },
          {
            type: 'table',
            rows: [
              ['item', 'qty'],
              ['books', '3'],
            ],
          },
        ],
      },
      ctx(root),
    )) as { bytes: number; blocks: number; created: boolean };
    expect(result.created).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);

    const html = await readDocxHtml(target);
    expect(html).toContain('<h1>Proposal</h1>');
    expect(html).toContain('Introduction paragraph');
    expect(html).toContain('First point');
    expect(html).toContain('<td><p>books</p></td>');
    expect(html).toContain('<td><p>3</p></td>');
  });

  test('respects overwrite and rejects empty blocks', async () => {
    const def = writeDocxTool();
    const target = path.join(root, 'nested', 'doc.docx');
    const first = (await def.execute(
      { path: target, blocks: [{ type: 'paragraph', text: 'hello' }] },
      ctx(root),
    )) as { created: boolean };
    expect(first.created).toBe(true);
    await expect(
      def.execute(
        { path: target, overwrite: false, blocks: [{ type: 'paragraph', text: 'again' }] },
        ctx(root),
      ),
    ).rejects.toThrow('overwrite is false');
    await expect(def.execute({ path: target, blocks: [] }, ctx(root))).rejects.toThrow(
      'At least one block',
    );
  });
});
