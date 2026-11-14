import { describe, expect, test } from 'bun:test';
import { attributedText, authorLabel } from './routing.ts';

describe('attribution', () => {
  test('prefers the username, then the first name', () => {
    expect(authorLabel({ username: 'ada', first_name: 'Ada' })).toBe('@ada');
    expect(authorLabel({ first_name: 'Ada' })).toBe('Ada');
    expect(authorLabel(undefined)).toBe('unknown sender');
  });

  test('prefixes the bridged text', () => {
    expect(attributedText('@ada', 'Design', 'ship it')).toBe('From @ada in Design: ship it');
  });
});
