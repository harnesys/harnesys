import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { presentToolOutput } from './clip-tool-output.ts';

describe('presentToolOutput', () => {
  test('keeps short output inline', async () => {
    const text = await presentToolOutput({
      value: 'short',
      toolName: 'read_file',
      toolCallId: 'c1',
      sessionId: 'thread-1',
      paths: { cwd: '/tmp' },
      settings: { maxChars: 100 },
    });
    expect(text).toBe('short');
  });

  test('clips long output and points at the spilled thread file', async () => {
    const threadDir = await mkdtemp(path.join(tmpdir(), 'harnesys-tool-output-'));
    const text = await presentToolOutput({
      value: 'a'.repeat(5_000),
      toolName: 'read_file',
      toolCallId: 'c1',
      sessionId: 'thread-1',
      paths: { threadDir },
      settings: { maxChars: 100, headChars: 10, tailChars: 10 },
    });
    expect(text).toContain('chars omitted');
    expect(text).toContain('thread:tool-outputs/read_file-c1.txt');
    const spilled = await Bun.file(path.join(threadDir, 'tool-outputs/read_file-c1.txt')).text();
    expect(spilled).toHaveLength(5_000);
  });
});
