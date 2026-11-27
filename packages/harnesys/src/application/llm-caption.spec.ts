import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attachmentReader, resolveThreadPath } from './attachment-reader.ts';
import { captionLocatorOf } from './llm.ts';
import { type HistoryMessage, materializeToolMedia } from './tool-message.ts';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function statFnOf(paths: { cwd?: string; threadDir?: string }) {
  return (locator: string) => ({ size: statSync(resolveThreadPath(locator, paths)).size });
}

function historyWith(locator: string): HistoryMessage[] {
  return [
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'c1', name: 'file_read_image' }],
    },
    {
      role: 'tool',
      toolCallId: 'c1',
      name: 'file_read_image',
      content: JSON.stringify({ ok: true, path: locator, mediaType: 'image/png', kind: 'image' }),
    },
  ];
}

function threadFixture(): { cwd: string; threadDir: string; scratch: string } {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'harnesys-caption-')));
  const threadDir = path.join(home, 'thread');
  const cwd = path.join(home, 'workspace');
  const scratch = path.join(threadDir, 'sandbox', 'read-image');
  mkdirSync(scratch, { recursive: true });
  mkdirSync(path.join(threadDir, 'attachments'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(path.join(scratch, 'x.png'), PNG_1X1);
  return { cwd, threadDir, scratch };
}

describe('caption locators', () => {
  test('captures the last token in every supported form', () => {
    expect(
      captionLocatorOf('[image from file_read_image (call c1) sandbox/read-image/x.jpg]'),
    ).toBe('sandbox/read-image/x.jpg');
    expect(captionLocatorOf('[image from file_read_image (call c1) /data/thread/x.png]')).toBe(
      '/data/thread/x.png',
    );
    expect(captionLocatorOf('[images from tools]')).toBeNull();
    expect(captionLocatorOf('[image from tool (call c1)]')).toBeNull();
  });

  test('a thread-rooted run renders the stored absolute as a run-root-relative caption', async () => {
    const { threadDir, scratch } = threadFixture();
    const paths = { cwd: threadDir, threadDir };
    const media = await materializeToolMedia(
      historyWith(path.join(scratch, 'x.png')),
      statFnOf(paths),
      attachmentReader({ paths }),
      { runRoot: threadDir },
    );
    expect(media.stats).toEqual({ materialized: 1, failed: 0 });
    const parts = media.inserts[0]?.message.content as { text?: string }[];
    const caption = parts.find((part) => part.text?.startsWith('[image from '))?.text ?? '';
    expect(captionLocatorOf(caption)).toBe('sandbox/read-image/x.png');
  });

  test('an anchored run renders the stored absolute verbatim in the caption', async () => {
    const { cwd, threadDir, scratch } = threadFixture();
    const paths = { cwd, threadDir };
    const abs = path.join(scratch, 'x.png');
    const media = await materializeToolMedia(
      historyWith(abs),
      statFnOf(paths),
      attachmentReader({ paths }),
      { runRoot: cwd },
    );
    expect(media.stats).toEqual({ materialized: 1, failed: 0 });
    const parts = media.inserts[0]?.message.content as { text?: string }[];
    const caption = parts.find((part) => part.text?.startsWith('[image from '))?.text ?? '';
    expect(captionLocatorOf(caption)).toBe(abs);
  });

  test('a relative attachments locator resolves against the run root in sandbox mode', async () => {
    const { threadDir } = threadFixture();
    const att = path.join(threadDir, 'attachments', 'a1', 'pic.png');
    mkdirSync(path.dirname(att), { recursive: true });
    writeFileSync(att, PNG_1X1);
    const paths = { cwd: threadDir, threadDir };
    expect(resolveThreadPath('attachments/a1/pic.png', paths)).toBe(att);
    const media = await materializeToolMedia(
      historyWith('attachments/a1/pic.png'),
      statFnOf(paths),
      attachmentReader({ paths }),
      { runRoot: threadDir },
    );
    expect(media.stats).toEqual({ materialized: 1, failed: 0 });
  });
});
