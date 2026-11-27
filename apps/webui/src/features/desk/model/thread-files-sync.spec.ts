import { describe, expect, test } from 'bun:test';
import { threadFilesInvalidations } from './thread-files-sync.ts';

describe('threadFilesInvalidations', () => {
  test('attachments roots invalidate uploads and event artifacts', () => {
    expect(threadFilesInvalidations('org-1', 'th-1', ['attachments'])).toEqual([
      ['thread-attachments', 'th-1'],
      ['thread-artifacts', 'th-1'],
    ]);
  });

  test('thread and tool-outputs roots invalidate the thread files tree prefix', () => {
    expect(threadFilesInvalidations('org-1', 'th-1', ['thread', 'tool-outputs'])).toEqual([
      ['thread-files', 'org-1', 'th-1'],
    ]);
  });

  test('mixed roots invalidate both groups once', () => {
    expect(threadFilesInvalidations('org-1', 'th-1', ['thread', 'attachments'])).toEqual([
      ['thread-attachments', 'th-1'],
      ['thread-artifacts', 'th-1'],
      ['thread-files', 'org-1', 'th-1'],
    ]);
  });

  test('empty roots invalidate nothing', () => {
    expect(threadFilesInvalidations('org-1', 'th-1', [])).toEqual([]);
  });
});
