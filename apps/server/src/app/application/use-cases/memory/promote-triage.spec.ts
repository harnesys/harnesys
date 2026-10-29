import { describe, expect, test } from 'bun:test';
import { parseTriageVerdict, triagePrompt } from './promote-triage.ts';

const IDS = ['id-a', 'id-b', 'id-c'];

describe('parseTriageVerdict', () => {
  test('parses comma-separated indices', () => {
    expect(parseTriageVerdict('1,3', IDS)).toEqual(['id-a', 'id-c']);
  });

  test('parses numbered list with prose and punctuation', () => {
    expect(parseTriageVerdict('Promote:\n1. first candidate\n3. third', IDS)).toEqual([
      'id-a',
      'id-c',
    ]);
  });

  test('ignores out-of-range indices and numbers embedded in ids', () => {
    expect(parseTriageVerdict('only 2 (skip 0, 4, 99 and id-b123)', IDS)).toEqual(['id-b']);
  });

  test('deduplicates while preserving candidate order', () => {
    expect(parseTriageVerdict('3,1,3', IDS)).toEqual(['id-a', 'id-c']);
  });

  test('explicit none is an empty selection', () => {
    expect(parseTriageVerdict('None.', IDS)).toEqual([]);
  });

  test('unrecognizable output returns undefined for caller fallback', () => {
    expect(parseTriageVerdict('I cannot decide', IDS)).toBeUndefined();
  });
});

describe('triagePrompt', () => {
  test('lists candidates numbered from one with ids', () => {
    const prompt = triagePrompt([
      { id: 'id-a', text: 'alpha' },
      { id: 'id-b', text: 'beta' },
    ]);
    expect(prompt).toContain('1. [id-a] alpha');
    expect(prompt).toContain('2. [id-b] beta');
  });
});
