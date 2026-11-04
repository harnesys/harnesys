import { describe, expect, test } from 'bun:test';
import { ConnectorValidationException } from './connector.error.ts';
import { threadKindOfChat } from './thread-kind.ts';

describe('threadKindOfChat', () => {
  test('maps a direct message to a chat thread', () => {
    expect(threadKindOfChat('private')).toBe('chat');
  });

  test('maps groups and supergroups to group threads', () => {
    expect(threadKindOfChat('group')).toBe('group');
    expect(threadKindOfChat('supergroup')).toBe('group');
  });

  test('maps channels to group threads', () => {
    expect(threadKindOfChat('channel')).toBe('group');
  });

  test('rejects unknown chat types', () => {
    expect(() => threadKindOfChat('sender')).toThrow(ConnectorValidationException);
  });
});
