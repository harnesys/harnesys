import { describe, expect, test } from 'bun:test';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { assertUniqueMentionNames } from './mention-names.ts';

describe('assertUniqueMentionNames', () => {
  test('accepts distinct names', () => {
    expect(() =>
      assertUniqueMentionNames([
        { id: 'a1', name: 'Coder' },
        { id: 'a2', name: 'Reviewer' },
      ]),
    ).not.toThrow();
  });

  test('rejects names that collide case-insensitively', () => {
    expect(() =>
      assertUniqueMentionNames([
        { id: 'a1', name: 'Coder' },
        { id: 'a2', name: 'coder' },
      ]),
    ).toThrow(ConnectorValidationException);
  });

  test('rejects names that collide after slugging', () => {
    expect(() =>
      assertUniqueMentionNames([
        { id: 'a1', name: 'Code Bot' },
        { id: 'a2', name: 'code-bot' },
      ]),
    ).toThrow(ConnectorValidationException);
  });

  test('ignores the same agent appearing twice', () => {
    expect(() =>
      assertUniqueMentionNames([
        { id: 'a1', name: 'Coder' },
        { id: 'a1', name: 'Coder' },
      ]),
    ).not.toThrow();
  });
});
