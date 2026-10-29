import { describe, expect, test } from 'bun:test';
import { resolve, sep } from 'node:path';
import { resolveThreadEntryPath, threadFileContentType } from './thread-files-paths.ts';

const THREAD_DIR = resolve('/data/harnesys/orgs/org-1/threads/thread-1');

describe('resolveThreadEntryPath', () => {
  test('resolves paths inside allowed thread roots', () => {
    expect(resolveThreadEntryPath(THREAD_DIR, 'sandbox')).toBe(`${THREAD_DIR}${sep}sandbox`);
    expect(resolveThreadEntryPath(THREAD_DIR, 'sandbox/sub/../report.txt')).toBe(
      `${THREAD_DIR}${sep}sandbox${sep}report.txt`,
    );
    expect(resolveThreadEntryPath(THREAD_DIR, 'attachments/abc/file.png')).toBe(
      `${THREAD_DIR}${sep}attachments${sep}abc${sep}file.png`,
    );
  });

  test('rejects traversal outside the thread dir', () => {
    expect(resolveThreadEntryPath(THREAD_DIR, '../org-2/threads/thread-2/secret.txt')).toBeNull();
    expect(resolveThreadEntryPath(THREAD_DIR, 'sandbox/../../../../etc/passwd')).toBeNull();
    expect(resolveThreadEntryPath(THREAD_DIR, '/etc/passwd')).toBeNull();
  });

  test('rejects paths outside the known thread roots', () => {
    expect(resolveThreadEntryPath(THREAD_DIR, 'runs/run-1/out.bin')).toBeNull();
    expect(resolveThreadEntryPath(THREAD_DIR, '')).toBeNull();
    expect(resolveThreadEntryPath(THREAD_DIR, '.')).toBeNull();
  });
});

describe('threadFileContentType', () => {
  test('maps known extensions', () => {
    expect(threadFileContentType('report.pdf')).toBe('application/pdf');
    expect(threadFileContentType('shot.PNG')).toBe('image/png');
  });

  test('falls back to octet-stream', () => {
    expect(threadFileContentType('data.bin')).toBe('application/octet-stream');
    expect(threadFileContentType('noext')).toBe('application/octet-stream');
  });
});
