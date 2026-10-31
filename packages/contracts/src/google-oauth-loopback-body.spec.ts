import { describe, expect, test } from 'bun:test';
import { GoogleOAuthLoopbackStartBodySchema } from './integrations.ts';

describe('GoogleOAuthLoopbackStartBodySchema', () => {
  test('accepts youtube alone', () => {
    const parsed = GoogleOAuthLoopbackStartBodySchema.parse({ services: ['youtube'] });
    expect(parsed.services).toEqual(['youtube']);
  });

  test('accepts a mix without youtube', () => {
    const parsed = GoogleOAuthLoopbackStartBodySchema.parse({
      services: ['drive', 'gmail', 'sheets'],
    });
    expect(parsed.services).toHaveLength(3);
  });

  test('rejects youtube combined with other services', () => {
    expect(() =>
      GoogleOAuthLoopbackStartBodySchema.parse({ services: ['youtube', 'drive'] }),
    ).toThrow(/on its own/);
  });

  test('rejects an empty selection', () => {
    expect(() => GoogleOAuthLoopbackStartBodySchema.parse({ services: [] })).toThrow();
  });
});
