import { describe, expect, test } from 'bun:test';
import {
  attachmentRelPath,
  kindFromMediaType,
  MAX_ATTACHMENT_BYTES,
  sanitizeFileName,
} from './attachment.ts';

describe('kindFromMediaType', () => {
  test('maps image prefixes to image kind', () => {
    expect(kindFromMediaType('image/png')).toBe('image');
    expect(kindFromMediaType('image/jpeg')).toBe('image');
  });

  test('maps audio and video prefixes', () => {
    expect(kindFromMediaType('audio/mpeg')).toBe('audio');
    expect(kindFromMediaType('video/mp4')).toBe('video');
  });

  test('falls back to file kind for other media types', () => {
    expect(kindFromMediaType('application/pdf')).toBe('file');
    expect(kindFromMediaType('text/plain')).toBe('file');
  });
});

describe('sanitizeFileName', () => {
  test('strips directory components', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\temp\\report.pdf')).toBe('report.pdf');
  });

  test('replaces unsafe characters with underscore', () => {
    expect(sanitizeFileName('my report (v2).pdf')).toBe('my report (v2).pdf');
    expect(sanitizeFileName('a:b*c?.txt')).toBe('a_b_c_.txt');
  });

  test('strips leading dots and falls back for empty names', () => {
    expect(sanitizeFileName('.hidden')).toBe('hidden');
    expect(sanitizeFileName('..')).toBe('file');
    expect(sanitizeFileName('')).toBe('file');
  });
});

describe('attachmentRelPath', () => {
  test('builds attachments/<id>/<name> relative path', () => {
    expect(attachmentRelPath('a1', 'notes.txt')).toBe('attachments/a1/notes.txt');
  });
});

describe('MAX_ATTACHMENT_BYTES', () => {
  test('is 20 MiB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
  });
});
