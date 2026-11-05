import { describe, expect, test } from 'bun:test';
import { normalizeChatRef } from './chat-ref.ts';

describe('normalizeChatRef', () => {
  test('accepts usernames, public links and numeric ids as they are', () => {
    expect(normalizeChatRef(' @my_group ')).toBe('@my_group');
    expect(normalizeChatRef('https://t.me/my_group')).toBe('@my_group');
    expect(normalizeChatRef('t.me/my_group/12')).toBe('@my_group');
    expect(normalizeChatRef('-1001234567890')).toBe('-1001234567890');
  });

  test('turns a private link into the supergroup id', () => {
    expect(normalizeChatRef('https://t.me/c/1234567890/42')).toBe('-1001234567890');
  });

  test('rejects empty values and invite links', () => {
    expect(() => normalizeChatRef('   ')).toThrow();
    expect(() => normalizeChatRef('https://t.me/+AbCdEf')).toThrow();
  });
});
