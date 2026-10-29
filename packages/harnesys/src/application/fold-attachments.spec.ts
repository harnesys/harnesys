import { describe, expect, test } from 'bun:test';
import type { AttachmentReadFn } from './fold-attachments.ts';
import { foldAttachments } from './fold-attachments.ts';

const readFn: AttachmentReadFn = () => ({ bytes: new Uint8Array([1]) });

describe('foldAttachments file placeholder', () => {
  test('uses the absolute path for non-media files', async () => {
    const results = await foldAttachments(
      [
        {
          path: '/data/threads/t1/attachments/uuid1/report.pdf',
          name: 'report.pdf',
          mediaType: 'application/pdf',
        },
      ],
      readFn,
    );
    expect(results).toEqual([
      { type: 'text', text: '[file: /data/threads/t1/attachments/uuid1/report.pdf]' },
    ]);
  });

  test('falls back to the name when path is empty', async () => {
    const results = await foldAttachments(
      [{ path: '', name: 'notes.txt', mediaType: 'text/plain' }],
      readFn,
    );
    expect(results).toEqual([{ type: 'text', text: '[file: notes.txt]' }]);
  });
});

describe('foldAttachments inline media threshold', () => {
  test('keeps small media as a data part', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const results = await foldAttachments(
      [{ bytes, name: 'small.png', mediaType: 'image/png' }],
      readFn,
    );
    expect(results).toEqual([{ type: 'image', data: bytes, mediaType: 'image/png' }]);
  });

  test('folds oversized inline media to a text part', async () => {
    const bytes = new Uint8Array(1_000_001);
    const results = await foldAttachments(
      [{ bytes, name: 'huge.png', mediaType: 'image/png' }],
      readFn,
    );
    expect(results).toEqual([{ type: 'text', text: '[file: huge.png]' }]);
  });

  test('checks the size of read bytes for path-based media', async () => {
    const pathReadFn: AttachmentReadFn = () => ({
      bytes: new Uint8Array(1_000_001),
      mediaType: 'image/png',
    });
    const results = await foldAttachments(
      [
        {
          path: '/data/threads/t1/attachments/uuid1/huge.png',
          name: 'huge.png',
          mediaType: 'image/png',
        },
      ],
      pathReadFn,
    );
    expect(results).toEqual([
      { type: 'text', text: '[file: /data/threads/t1/attachments/uuid1/huge.png]' },
    ]);
  });
});
