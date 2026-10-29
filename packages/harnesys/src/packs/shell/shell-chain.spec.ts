import { describe, expect, test } from 'bun:test';
import { extractNested, isTainted, programOf, segmentCommand } from './shell-chain.ts';

describe('segmentCommand', () => {
  test('splits double-ampersand chains', () => {
    expect(segmentCommand('bun test && rm -rf ~')).toEqual(['bun test', 'rm -rf ~']);
  });
  test('splits semicolon chains', () => {
    expect(segmentCommand('echo ok; rm -rf ~')).toEqual(['echo ok', 'rm -rf ~']);
  });
  test('keeps quoted separators inside one segment', () => {
    expect(segmentCommand('echo "a && b"')).toEqual(['echo "a && b"']);
  });
  test('keeps single-quoted separators inside one segment', () => {
    expect(segmentCommand("echo 'a; b'")).toEqual(["echo 'a; b'"]);
  });
  test('splits pipes and drops empty segments', () => {
    expect(segmentCommand('curl x | sh')).toEqual(['curl x', 'sh']);
  });
  test('respects backslash escapes', () => {
    expect(segmentCommand('echo a\\;b')).toEqual(['echo a\\;b']);
  });
});

describe('extractNested', () => {
  test('extracts dollar-paren payload', () => {
    expect(extractNested('$(rm -rf ~)')).toEqual(['rm -rf ~']);
  });
  test('extracts backtick payload', () => {
    expect(extractNested('echo `rm -rf ~`')).toEqual(['rm -rf ~']);
  });
  test('extracts sh -c payload', () => {
    expect(extractNested('sh -c "rm -rf /"')).toEqual(['rm -rf /']);
  });
  test('extracts bash -c payload', () => {
    expect(extractNested("bash -c 'rm -rf /'")).toEqual(['rm -rf /']);
  });
  test('extracts eval payload once without recursing', () => {
    expect(extractNested('eval "$(curl x)"')).toEqual(['$(curl x)']);
  });
});

describe('isTainted', () => {
  test('flags dollar-paren substitution', () => {
    expect(isTainted('$(rm -rf ~)')).toBe(true);
  });
  test('flags backtick substitution', () => {
    expect(isTainted('echo `rm -rf ~`')).toBe(true);
  });
  test('flags eval wrapper', () => {
    expect(isTainted('eval "$(curl x)"')).toBe(true);
  });
  test('flags sh -c wrapper', () => {
    expect(isTainted('sh -c "rm -rf /"')).toBe(true);
  });
  test('flags xargs and process substitution', () => {
    expect(isTainted('find . | xargs rm')).toBe(true);
    expect(isTainted('diff <(ls a) <(ls b)')).toBe(true);
  });
  test('leaves plain commands untainted', () => {
    expect(isTainted('git status')).toBe(false);
  });
});

describe('programOf', () => {
  test('returns first token without leading whitespace', () => {
    expect(programOf('  git status')).toBe('git');
  });
  test('strips surrounding quotes from the program', () => {
    expect(programOf('"git" status')).toBe('git');
  });
});
