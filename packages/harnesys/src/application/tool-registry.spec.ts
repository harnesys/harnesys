import { describe, expect, test } from 'bun:test';
import { validateToolInput } from './tool-registry.ts';

describe('validateToolInput', () => {
  test('draft-07 schema validates normally', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'number' } },
      required: ['a'],
    };
    expect(validateToolInput(schema, { a: 1 }).ok).toBe(true);
    expect(validateToolInput(schema, { a: 'x' }).ok).toBe(false);
  });

  test('draft 2020-12 dialect from MCP servers does not throw', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
      additionalProperties: false,
    };
    expect(validateToolInput(schema, { message: 'hi' }).ok).toBe(true);
    const bad = validateToolInput(schema, { wrong: 1 });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain('message');
  });
});
