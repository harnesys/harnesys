import { describe, expect, test } from 'bun:test';
import { formatFactLine, relevanceScore } from './relevance.ts';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

describe('relevanceScore', () => {
  test('fresher fact outranks an older one at equal importance', () => {
    const fresh = relevanceScore(
      { importance: 5, updatedAt: '2026-10-24T00:00:00.000Z', accessCount: 1 },
      NOW,
      30,
    );
    const older = relevanceScore(
      { importance: 5, updatedAt: '2026-09-24T00:00:00.000Z', accessCount: 1 },
      NOW,
      30,
    );
    expect(fresh).toBeGreaterThan(older);
  });

  test('higher accessCount outranks lower at equal age and importance', () => {
    const often = relevanceScore(
      { importance: 5, updatedAt: '2026-10-24T00:00:00.000Z', accessCount: 10 },
      NOW,
      30,
    );
    const once = relevanceScore(
      { importance: 5, updatedAt: '2026-10-24T00:00:00.000Z', accessCount: 1 },
      NOW,
      30,
    );
    expect(often).toBeGreaterThan(once);
  });
});

describe('formatFactLine', () => {
  test('clips long text to clipChars with an ellipsis', () => {
    const line = formatFactLine({ text: 'x'.repeat(250), source: 'agent' }, 200);
    expect(line).toBe(`[agent] ${'x'.repeat(200)}…`);
  });

  test('labels compaction facts as system', () => {
    expect(formatFactLine({ text: 'short fact', source: 'compaction' }, 200)).toBe(
      '[system] short fact',
    );
  });
});
