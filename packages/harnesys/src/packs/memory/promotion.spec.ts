import { describe, expect, test } from 'bun:test';
import { appendPromotionBlock } from './promotion.ts';

describe('appendPromotionBlock', () => {
  test('appends a promotion block to the instructions', () => {
    const result = appendPromotionBlock('Existing instructions.', {
      id: 'p-1',
      date: '2026-10-24',
      text: 'Prefers concise answers.',
    });
    expect(result).toBe(
      'Existing instructions.\n\n<!-- memory:promotion p-1 2026-10-24 -->\n- Prefers concise answers.',
    );
  });

  test('is idempotent for the same promotion id', () => {
    const block = { id: 'p-1', date: '2026-10-24', text: 'Prefers concise answers.' };
    const once = appendPromotionBlock('Existing instructions.', block);
    expect(appendPromotionBlock(once, block)).toBe(once);
  });
});
