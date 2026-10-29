import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { mapToErrorResponse } from '../errors/error-filter';
import { BadRequestException } from '../errors/http-exception';
import type { ParamDef } from '../http/params';
import { Body, paramsKey, Query } from '../http/params';
import { validateWithSchema } from './zod-pipe';

const titleSchema = z.object({ title: z.string().min(1) });
const pageSchema = z.object({ page: z.coerce.number() });

function caughtError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected validateWithSchema to throw');
}

describe('validateWithSchema', () => {
  test('valid input returns parsed value with coercion applied', () => {
    expect(validateWithSchema(titleSchema, { title: 'hello' }, 'body')).toEqual({
      title: 'hello',
    });
    expect(validateWithSchema(pageSchema, { page: '2' }, 'query')).toEqual({ page: 2 });
  });

  test('invalid input throws BadRequestException with VALIDATION_ERROR and issues', () => {
    const err = caughtError(() => validateWithSchema(titleSchema, {}, 'body'));
    expect(err).toBeInstanceOf(BadRequestException);
    if (err instanceof BadRequestException) {
      expect(err.status).toBe(400);
      expect(err.errorCode).toBe('VALIDATION_ERROR');
      expect(typeof err.message).toBe('string');
      const details = err.details as { issues: unknown[] };
      expect(Array.isArray(details.issues)).toBe(true);
      expect(details.issues.length).toBeGreaterThan(0);
    }
  });

  test('missing schema returns value untouched', () => {
    const body = { title: 'raw' };
    expect(validateWithSchema(undefined, body, 'body')).toBe(body);
    const query = { page: 'raw' };
    expect(validateWithSchema(undefined, query, 'query')).toBe(query);
  });

  test('Body(schema) and Query(schema) store the schema on the param definition', () => {
    class Sample {
      create(@Body(titleSchema) body: unknown, @Query(pageSchema) query: unknown): unknown {
        return { body, query };
      }
    }
    const defs = Reflect.getMetadata(paramsKey, Sample.prototype, 'create') as ParamDef[];
    const sorted = [...defs].sort((left, right) => left.index - right.index);
    expect(sorted.map((def) => ({ index: def.index, kind: def.kind }))).toEqual([
      { index: 0, kind: 'body' },
      { index: 1, kind: 'query' },
    ]);
    expect(sorted[0]?.schema).toBe(titleSchema);
    expect(sorted[1]?.schema).toBe(pageSchema);
  });

  test('invalid JSON body error keeps the uniform VALIDATION_ERROR contract', () => {
    const err = new BadRequestException('Invalid JSON body', { issues: [] });
    expect(err.details).toEqual({ issues: [] });
    const body = mapToErrorResponse(err, { path: '/threads' });
    expect(body).toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid JSON body',
    });
    expect(body.details).toEqual({ issues: [] });
  });
});
