import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAllowedPath, resolveWorkdirPath } from './path-resolve.ts';

describe('resolveWorkdirPath', () => {
  let home: string;
  let cwd: string;
  let outside: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'harnesys-pathroots-')));
    cwd = join(home, 'sandbox');
    outside = join(home, 'outside');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(cwd, 'note.txt'), 'x');
    writeFileSync(join(outside, 'secret.txt'), 'secret');
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('resolves targets inside the workdir', () => {
    expect(resolveWorkdirPath(cwd, 'note.txt')).toBe(join(cwd, 'note.txt'));
    expect(resolveWorkdirPath(cwd, join(cwd, 'note.txt'))).toBe(join(cwd, 'note.txt'));
  });

  test('rejects targets outside the workdir', () => {
    expect(() => resolveWorkdirPath(cwd, join(outside, 'secret.txt'))).toThrow('escapes workdir');
  });

  test('root narrows the jail below the workdir', () => {
    const inner = join(cwd, 'inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(inner, 'ok.txt'), 'x');
    expect(resolveWorkdirPath(cwd, join(inner, 'ok.txt'), inner)).toBe(join(inner, 'ok.txt'));
    expect(() => resolveWorkdirPath(cwd, join(cwd, 'note.txt'), inner)).toThrow('escapes workdir');
  });

  test('symlink escaping the jail is rejected', () => {
    symlinkSync(join(outside, 'secret.txt'), join(cwd, 'leak.txt'));
    expect(() => resolveWorkdirPath(cwd, join(cwd, 'leak.txt'))).toThrow('escapes workdir');
  });
});

describe('resolveAllowedPath', () => {
  let home: string;
  let cwd: string;
  let workspace: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'harnesys-allowedroots-')));
    cwd = join(home, 'sandbox');
    workspace = join(home, 'workspace');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(cwd, 'note.txt'), 'x');
    writeFileSync(join(workspace, 'cursor.json'), '{}');
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('resolves absolute targets inside allowed roots beyond the workdir', () => {
    expect(resolveAllowedPath(cwd, join(workspace, 'cursor.json'), [workspace])).toBe(
      join(workspace, 'cursor.json'),
    );
  });

  test('resolves relative targets against the workdir', () => {
    expect(resolveAllowedPath(cwd, 'note.txt', [workspace])).toBe(join(cwd, 'note.txt'));
  });

  test('rejects targets outside the workdir and all allowed roots', () => {
    expect(() => resolveAllowedPath(cwd, join(home, 'secret.txt'), [workspace])).toThrow(
      'escapes workdir',
    );
  });

  test('root still narrows the jail below the workdir', () => {
    expect(() =>
      resolveAllowedPath(cwd, join(cwd, 'note.txt'), [workspace], join(cwd, 'inner')),
    ).toThrow('escapes workdir');
  });
});
