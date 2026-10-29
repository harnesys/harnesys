import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  browserArtifactsDir,
  expiredArtifactPaths,
  outputPathArgIndex,
  withArtifactPaths,
} from './browser-artifacts.ts';

const DIR = join(homedir(), '.harnesys', 'browser-artifacts', 'scope');

describe('browserArtifactsDir', () => {
  test('is under ~/.harnesys/browser-artifacts/<session>', () => {
    expect(browserArtifactsDir('scope')).toBe(DIR);
  });
});

describe('outputPathArgIndex', () => {
  test('detects output path positions', () => {
    expect(outputPathArgIndex('screenshot', [])).toBe(0);
    expect(outputPathArgIndex('pdf', ['out.pdf'])).toBe(0);
    expect(outputPathArgIndex('download', ['@e1', 'file.zip'])).toBe(1);
    expect(outputPathArgIndex('record', ['start', 'video.webm'])).toBe(1);
    expect(outputPathArgIndex('trace', ['stop'])).toBe(1);
    expect(outputPathArgIndex('profiler', ['stop', 'p.json'])).toBe(1);
    expect(outputPathArgIndex('network', ['har', 'stop', 'trace.har'])).toBe(2);
  });
  test('ignores commands without file output', () => {
    expect(outputPathArgIndex('open', ['https://example.com'])).toBeNull();
    expect(outputPathArgIndex('click', ['@e1'])).toBeNull();
    expect(outputPathArgIndex('record', ['stop'])).toBeNull();
    expect(outputPathArgIndex('network', ['requests'])).toBeNull();
  });
});

describe('withArtifactPaths', () => {
  test('redirects relative paths into the artifacts dir', () => {
    expect(withArtifactPaths('screenshot', ['shot.png'], DIR, 1)).toEqual([join(DIR, 'shot.png')]);
    expect(withArtifactPaths('pdf', ['reports/out.pdf'], DIR, 1)).toEqual([
      join(DIR, 'reports', 'out.pdf'),
    ]);
  });
  test('keeps absolute paths untouched', () => {
    expect(withArtifactPaths('screenshot', ['/tmp/keep.png'], DIR, 1)).toEqual(['/tmp/keep.png']);
  });
  test('injects a default name for screenshot and pdf', () => {
    expect(withArtifactPaths('screenshot', [], DIR, 42)).toEqual([join(DIR, 'screenshot-42.png')]);
    expect(withArtifactPaths('pdf', [], DIR, 42)).toEqual([join(DIR, 'pdf-42.pdf')]);
  });
  test('does not invent a path for optional outputs', () => {
    expect(withArtifactPaths('trace', ['stop'], DIR, 42)).toEqual(['stop']);
    expect(withArtifactPaths('record', ['stop'], DIR, 42)).toEqual(['stop']);
  });
  test('leaves non-output commands alone', () => {
    expect(withArtifactPaths('open', ['https://example.com'], DIR, 42)).toEqual([
      'https://example.com',
    ]);
  });
});

describe('expiredArtifactPaths', () => {
  const entries = [
    { path: '/old.png', mtimeMs: 1_000 },
    { path: '/fresh.png', mtimeMs: 9_000 },
  ];
  test('expires entries older than the ttl', () => {
    expect(expiredArtifactPaths(entries, 10_000, 5_000)).toEqual(['/old.png']);
  });
  test('keeps everything within the ttl', () => {
    expect(expiredArtifactPaths(entries, 10_000, 20_000)).toEqual([]);
  });
});
