import { describe, expect, test } from 'bun:test';
import type { ErrorObject } from 'ajv';
import Ajv from 'ajv';
import { formatAjvErrors, validateToolInput } from './tool-registry.ts';

function errorsFor(schema: unknown, data: unknown): ErrorObject[] {
  const ajv = new Ajv({ allErrors: true });
  ajv.validate(schema as never, data);
  return ajv.errors ?? [];
}

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

describe('formatAjvErrors', () => {
  test('simple type and required errors keep their message and path', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'number' }, list: { type: 'array', items: { type: 'string' } } },
      required: ['a', 'list'],
    };
    const lines = formatAjvErrors(errorsFor(schema, { list: [1] }));
    expect(lines).toContain("must have required property 'a' — at (root)");
    expect(lines).toContain('must be string — at /list/0');
  });

  test('oneOf arms collapse to one summary line per instance path', () => {
    const schema = {
      type: 'object',
      properties: {
        action: {
          oneOf: [
            {
              type: 'object',
              required: ['key', 'value'],
              properties: { key: { type: 'string' }, value: { type: 'string' } },
            },
            { type: 'object', required: ['delta'], properties: { delta: { type: 'number' } } },
            { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
          ],
        },
      },
    };
    const errors = errorsFor(schema, { action: {} });
    expect(errors.some((error) => error.keyword === 'oneOf')).toBe(true);
    expect(errors.length).toBeGreaterThan(1);
    const lines = formatAjvErrors(errors);
    expect(lines).toEqual([
      'expected one of: requires key, value, requires delta, requires path — at /action',
    ]);
    expect(lines.join(' ')).not.toContain('must have required property');
  });

  test('arm summaries fall back to the shallow message without required errors', () => {
    const schema = {
      type: 'object',
      properties: {
        mode: { oneOf: [{ type: 'number' }, { type: 'boolean' }] },
      },
    };
    expect(formatAjvErrors(errorsFor(schema, { mode: 'x' }))).toEqual([
      'expected one of: must be number, must be boolean — at /mode',
    ]);
  });

  test('output is capped with a +N more tail line', () => {
    const properties: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) {
      properties[`p${i}`] = { type: 'number' };
      data[`p${i}`] = 'wrong';
    }
    const lines = formatAjvErrors(errorsFor({ type: 'object', properties }, data));
    expect(lines).toHaveLength(13);
    expect(lines[12]).toBe('+8 more');
  });

  test('validateToolInput keeps the ok decision and reports a bounded string', () => {
    const schema = {
      type: 'object',
      properties: {
        action: {
          oneOf: [
            { type: 'object', required: ['key'] },
            { type: 'object', required: ['delta'] },
          ],
        },
      },
    };
    expect(validateToolInput(schema, { action: { key: 1 } }).ok).toBe(true);
    const bad = validateToolInput(schema, { action: {} });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain('expected one of');
    expect(bad.errors).toContain(' — at /action');
  });

  test('combinator fallback ignores errors without a string schemaPath', () => {
    const parent: ErrorObject = {
      keyword: 'oneOf',
      instancePath: '/action',
      schemaPath: '#/properties/action/oneOf',
      params: {},
      message: 'matches exactly one schema in oneOf',
    };
    const stray: ErrorObject = {
      keyword: 'required',
      instancePath: '/action',
      schemaPath: '#/properties/action/anyOf/0/required',
      params: { missingProperty: 'key' },
      message: "must have required property 'key'",
    };
    Reflect.deleteProperty(stray, 'schemaPath');
    const lines = formatAjvErrors([parent, stray]);
    expect(lines).toEqual([
      'matches exactly one schema in oneOf — at /action',
      "must have required property 'key' — at /action",
    ]);
  });
});
