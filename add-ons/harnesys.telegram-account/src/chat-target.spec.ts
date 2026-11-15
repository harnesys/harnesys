import { describe, expect, test } from 'bun:test';
import { AddonError } from '@harnesys/sdk';
import {
  chatRefOf,
  matchesAllowed,
  matchesIdentity,
  numericKeys,
  resolveArgOf,
} from './chat-target.ts';

describe('chat arguments', () => {
  test('normalizes chat formats and matches allowed_chats by id or username', () => {
    expect(chatRefOf('@SomeChannel').username).toBe('somechannel');
    expect(chatRefOf('https://t.me/some_channel/42?single').username).toBe('some_channel');
    expect(chatRefOf('t.me/s/some_channel').username).toBe('some_channel');
    expect(chatRefOf('-1001234567890').numeric).toEqual(['1234567890']);
    expect(chatRefOf('-1001234567890').kind).toBe('id');
    expect(resolveArgOf(chatRefOf('-1001234567890'))).toBe('1234567890');
    expect(numericKeys('@name')).toEqual([]);
    expect(() => chatRefOf('   ')).toThrow(AddonError);

    const sales = chatRefOf('@sales');
    expect(matchesAllowed([], sales, { peerId: '1', username: null })).toBe(true);
    expect(matchesAllowed(['123'], sales, { peerId: '123', username: 'sales' })).toBe(true);
    expect(
      matchesAllowed(['-1001234567890'], chatRefOf('@sales'), {
        peerId: '1234567890',
        username: null,
      }),
    ).toBe(true);
    expect(matchesAllowed(['@sales'], chatRefOf('123'), { peerId: '123', username: 'sales' })).toBe(
      true,
    );
    expect(matchesAllowed(['@other'], sales, { peerId: '999', username: null })).toBe(false);
  });

  test('matches an identity hit without a chat ref for global search', () => {
    expect(numericKeys('-1001234567890')).toEqual(['1234567890']);
    expect(matchesIdentity(['1234567890'], { peerId: '-1001234567890', username: null })).toBe(
      true,
    );
    expect(matchesIdentity(['-1001234567890'], { peerId: '1234567890', username: null })).toBe(
      true,
    );
    expect(matchesIdentity([], { peerId: '-1001234567890', username: null })).toBe(true);
    expect(matchesIdentity(['1001234567890'], { peerId: '-1001234567890', username: null })).toBe(
      false,
    );
  });

  test('reads t.me/c private links as numeric ids, not usernames', () => {
    for (const link of [
      'https://t.me/c/4334557990/1',
      'https://t.me/c/4334557990?single',
      't.me/c/4334557990/1#42',
      't.me/c/4334557990',
    ]) {
      const ref = chatRefOf(link);
      expect(ref.kind).toBe('id');
      expect(ref.username).toBeNull();
      expect(ref.numeric[0]).toBe('4334557990');
      expect(resolveArgOf(ref)).toBe('4334557990');
    }
    expect(resolveArgOf(chatRefOf('-1004334557990'))).toBe('4334557990');
    expect(
      matchesAllowed(['-1004334557990'], chatRefOf('t.me/c/4334557990/1'), {
        peerId: '4334557990',
        username: null,
      }),
    ).toBe(true);
  });

  test('rejects invite links instead of resolving them as usernames', () => {
    for (const link of [
      'https://t.me/+AbCdEf123',
      't.me/joinchat/AbCdEf123',
      'https://t.me/joinchat/AbCdEf123?x=1',
    ]) {
      try {
        chatRefOf(link);
        throw new Error(`expected ${link} to be rejected`);
      } catch (error) {
        expect(error).toBeInstanceOf(AddonError);
        expect((error as AddonError).reason).toBe('invalid_params');
        expect((error as AddonError).detail).toContain(
          'invite link cannot be read; join with this account and pass @username or t.me/c/<id>',
        );
      }
    }
  });
});
