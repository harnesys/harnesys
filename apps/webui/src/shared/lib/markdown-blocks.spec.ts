import { describe, expect, test } from 'bun:test';
import { lastBlockOffset } from './markdown-blocks';

describe('lastBlockOffset', () => {
  test('empty text has no boundary', () => {
    expect(lastBlockOffset('')).toBe(0);
  });

  test('a single growing block is never frozen', () => {
    expect(lastBlockOffset('one growing paragraph')).toBe(0);
  });

  test('the last block of several is the tail', () => {
    expect(lastBlockOffset('first\n\nsecond')).toBe(7);
  });

  test('a fenced code block is one block', () => {
    expect(lastBlockOffset('intro\n\n```ts\nconst a = 1;\n```')).toBe(7);
  });

  test('a gfm table is one block', () => {
    expect(lastBlockOffset('intro\n\n| a | b |\n| - | - |\n| 1 | 2 |')).toBe(7);
  });

  test('display math is one block', () => {
    expect(lastBlockOffset('intro\n\n$$\nx\n$$')).toBe(7);
  });
});
