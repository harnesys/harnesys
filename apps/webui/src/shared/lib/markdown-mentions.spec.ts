import { describe, expect, test } from 'bun:test';
import { markMentions } from './markdown-mentions';

describe('markMentions', () => {
  test('wraps handles after whitespace and punctuation', () => {
    expect(markMentions('hi @ada-lovelace')).toBe('hi [@ada-lovelace](mention:ada-lovelace)');
    expect(markMentions('(@ada)')).toBe('([@ada](mention:ada))');
  });

  test('leaves an existing mention link intact', () => {
    const linked = '[@ada](mention:ada) hello';
    expect(markMentions(linked)).toBe(linked);
  });

  test('skips fenced code blocks', () => {
    expect(markMentions('```\n@ada\n```')).toBe('```\n@ada\n```');
  });
});
