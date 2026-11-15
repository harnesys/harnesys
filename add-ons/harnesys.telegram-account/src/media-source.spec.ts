import { describe, expect, test } from 'bun:test';
import { AddonError } from '@harnesys/sdk';
import { parseMediaSource, workspacePathOf } from './media-source.ts';

function reasonOf(run: () => unknown): string {
  try {
    run();
    return 'no-error';
  } catch (error) {
    return error instanceof AddonError ? error.reason : 'other-error';
  }
}

describe('media source', () => {
  test('accepts https urls and normalizes workspace paths', () => {
    const url = parseMediaSource('https://cdn.example.com/a/pic.png');
    expect(url.kind).toBe('url');
    expect(url.name).toBe('pic.png');

    const path = parseMediaSource('  media/reports/q1.pdf ');
    expect(path.kind).toBe('path');
    if (path.kind === 'path') {
      expect(path.path).toBe('media/reports/q1.pdf');
      expect(path.name).toBe('q1.pdf');
    }

    expect(workspacePathOf('./media//./a.png')).toBe('media/a.png');
  });

  test('rejects escapes, absolute paths and non-https schemes', () => {
    expect(reasonOf(() => workspacePathOf('../secrets.txt'))).toBe('invalid_params');
    expect(reasonOf(() => workspacePathOf('media/../../etc/passwd'))).toBe('invalid_params');
    expect(reasonOf(() => workspacePathOf('/etc/passwd'))).toBe('invalid_params');
    expect(reasonOf(() => workspacePathOf('~/.ssh/id_rsa'))).toBe('invalid_params');
    expect(reasonOf(() => workspacePathOf('C:\\Windows\\system32'))).toBe('invalid_params');
    expect(reasonOf(() => workspacePathOf(''))).toBe('invalid_params');

    expect(reasonOf(() => parseMediaSource('http://example.com/a.png'))).toBe('invalid_params');
    expect(reasonOf(() => parseMediaSource('file:///etc/passwd'))).toBe('invalid_params');
    expect(reasonOf(() => parseMediaSource('data:image/png;base64,AAAA'))).toBe('invalid_params');
    expect(reasonOf(() => parseMediaSource(12))).toBe('invalid_params');
  });
});
