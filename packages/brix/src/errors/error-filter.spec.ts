import { describe, expect, test } from 'bun:test';
import { ZodError, z } from 'zod';
import { Injectable, isInjectable } from '../di/injectable';
import { Logger } from '../logging/logger';
import {
  BusinessRuleException,
  ConflictException,
  EntityNotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ValidationException,
} from './domain-exception';
import { APP_FILTER, DefaultErrorFilter, mapToErrorResponse } from './error-filter';
import { BadRequestException, HttpException, NotFoundException } from './http-exception';

const titleSchema = z.object({ title: z.string().min(1) });

describe('mapToErrorResponse', () => {
  test('EntityNotFoundException maps to 404 ENTITY_NOT_FOUND', () => {
    const body = mapToErrorResponse(new EntityNotFoundException('Thread not found'), {
      path: '/threads/1',
      traceId: 't-1',
    });

    expect(body).toMatchObject({
      statusCode: 404,
      errorCode: 'ENTITY_NOT_FOUND',
      message: 'Thread not found',
      path: '/threads/1',
      traceId: 't-1',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  test('domain table maps every subclass to its status and code', () => {
    const table = [
      { err: new ConflictException(), status: 409, code: 'CONFLICT' },
      { err: new ForbiddenException(), status: 403, code: 'FORBIDDEN' },
      { err: new UnauthorizedException(), status: 401, code: 'UNAUTHORIZED' },
      { err: new ValidationException(), status: 400, code: 'VALIDATION_ERROR' },
      { err: new BusinessRuleException(), status: 422, code: 'BUSINESS_RULE_VIOLATION' },
    ];

    for (const row of table) {
      const body = mapToErrorResponse(row.err, { path: '/x' });
      expect(body.statusCode).toBe(row.status);
      expect(body.errorCode).toBe(row.code);
      expect(typeof body.message).toBe('string');
    }
  });

  test('HttpException passes status, code, message, and details through', () => {
    const body = mapToErrorResponse(new HttpException(403, 'X', 'Custom denied', { reason: 't' }), {
      path: '/x',
    });

    expect(body).toMatchObject({ statusCode: 403, errorCode: 'X', message: 'Custom denied' });
    expect(body.details).toEqual({ reason: 't' });
  });

  test('NotFoundException maps to 404 NOT_FOUND', () => {
    const body = mapToErrorResponse(new NotFoundException('Route /nope not found'), {
      path: '/nope',
    });

    expect(body).toMatchObject({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Route /nope not found',
      path: '/nope',
    });
  });

  test('Zod-sourced BadRequestException maps to 400 VALIDATION_ERROR with issues', () => {
    try {
      titleSchema.parse({});
      throw new Error('expected ZodError');
    } catch (err) {
      if (err instanceof ZodError) {
        const body = mapToErrorResponse(
          new BadRequestException('Validation failed', { issues: err.issues }),
          { path: '/threads' },
        );
        expect(body).toMatchObject({
          statusCode: 400,
          errorCode: 'VALIDATION_ERROR',
          message: 'Validation failed',
        });
        expect(body.details).toEqual({ issues: err.issues });
        return;
      }
      throw err;
    }
  });

  test('raw ZodError maps to 400 VALIDATION_ERROR with issues', () => {
    const parsed = titleSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error('expected validation failure');
    }

    const body = mapToErrorResponse(parsed.error, { path: '/threads' });
    expect(body).toMatchObject({ statusCode: 400, errorCode: 'VALIDATION_ERROR' });
    expect(body.details).toEqual({ issues: parsed.error.issues });
  });

  test('unknown Error maps to 500 INTERNAL_ERROR without leaking stack', () => {
    const body = mapToErrorResponse(new Error('boom'), { path: '/threads', traceId: 't-9' });

    expect(body).toMatchObject({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      path: '/threads',
      traceId: 't-9',
    });
    expect(body.details).toBeUndefined();
    expect('stack' in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain('boom');
  });

  test('non-Error throws map to 500 INTERNAL_ERROR', () => {
    for (const thrown of ['oops', null, undefined, 42]) {
      const body = mapToErrorResponse(thrown, { path: '/threads' });
      expect(body).toMatchObject({ statusCode: 500, errorCode: 'INTERNAL_ERROR' });
      expect(body.details).toBeUndefined();
    }
  });

  test('traceId is omitted when not provided', () => {
    const body = mapToErrorResponse(new EntityNotFoundException(), { path: '/threads/1' });

    expect(body.traceId).toBeUndefined();
    expect('traceId' in body).toBe(false);
  });

  test('APP_FILTER token is the string token for the global filter', () => {
    expect(APP_FILTER).toBe('APP_FILTER');
  });
});

describe('DefaultErrorFilter', () => {
  interface Logged {
    level: string;
    obj: object;
    msg: string;
  }

  @Injectable()
  class RecordingLogger extends Logger {
    readonly entries: Logged[] = [];

    child(): Logger {
      return this;
    }

    info(obj: object, msg: string): void {
      this.entries.push({ level: 'info', obj, msg });
    }

    debug(obj: object, msg: string): void {
      this.entries.push({ level: 'debug', obj, msg });
    }

    warn(obj: object, msg: string): void {
      this.entries.push({ level: 'warn', obj, msg });
    }

    error(obj: object, msg: string): void {
      this.entries.push({ level: 'error', obj, msg });
    }
  }

  test('maps known errors through the contract without logging', () => {
    const logger = new RecordingLogger();
    const filter = new DefaultErrorFilter(logger);

    const body = filter.map(new EntityNotFoundException('gone'), { path: '/x', traceId: 't-1' });

    expect(body).toMatchObject({ statusCode: 404, errorCode: 'ENTITY_NOT_FOUND', traceId: 't-1' });
    expect(logger.entries).toEqual([]);
  });

  test('logs unhandled errors through the injected Logger and maps them to 500', () => {
    const logger = new RecordingLogger();
    const filter = new DefaultErrorFilter(logger);

    const body = filter.map(new Error('boom'), { path: '/x' });

    expect(body).toMatchObject({ statusCode: 500, errorCode: 'INTERNAL_ERROR' });
    expect(logger.entries.length).toBe(1);
    expect(logger.entries[0]?.level).toBe('error');
    expect(logger.entries[0]?.msg).toBe('Unhandled error');
  });

  test('DefaultErrorFilter is @Injectable so it can back the APP_FILTER token', () => {
    expect(isInjectable(DefaultErrorFilter)).toBe(true);
  });
});
