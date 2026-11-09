import { describe, expect, test } from 'bun:test';
import Ajv from 'ajv';
import { askUserSchema } from './ask-schema.ts';

function validates(schema: unknown, payload: unknown): boolean {
  const ajv = new Ajv({ strict: false });
  return ajv.validate(schema as object, payload);
}

describe('askUserSchema', () => {
  test('options require optionIds when text is not allowed', () => {
    const schema = askUserSchema({ options: [{ id: 'a', label: 'A' }], allowText: false });
    expect(validates(schema, { optionIds: ['a'] })).toBe(true);
    expect(validates(schema, {})).toBe(false);
    expect('required' in schema).toBe(true);
  });

  test('options allow answer with either optionIds or text', () => {
    const schema = askUserSchema({ options: [{ id: 'a', label: 'A' }], allowText: true });
    expect(validates(schema, { optionIds: ['a'] })).toBe(true);
    expect(validates(schema, { text: 'none of them' })).toBe(true);
    expect(validates(schema, {})).toBe(false);
  });

  test('multi allows several options', () => {
    const schema = askUserSchema({
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      multi: true,
      allowText: true,
    });
    expect(validates(schema, { optionIds: ['a', 'b'] })).toBe(true);
  });

  test('single choice limits optionIds to one', () => {
    const schema = askUserSchema({
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      allowText: true,
    });
    expect(validates(schema, { optionIds: ['a', 'b'] })).toBe(false);
    expect(validates(schema, { optionIds: ['x'] })).toBe(false);
  });

  test('no options requires only text', () => {
    const schema = askUserSchema({ allowText: true });
    expect(validates(schema, { text: 'answer' })).toBe(true);
    expect(validates(schema, {})).toBe(false);
  });
});
