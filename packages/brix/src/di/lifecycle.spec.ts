import { describe, expect, test } from 'bun:test';
import { hasModuleDestroy, hasModuleInit, runModuleDestroy, runModuleInit } from './lifecycle';

describe('lifecycle hooks', () => {
  test('detects hooks structurally', () => {
    expect(hasModuleInit({ onModuleInit: () => undefined })).toBe(true);
    expect(hasModuleInit({ onModuleInit: 'nope' })).toBe(false);
    expect(hasModuleInit({})).toBe(false);
    expect(hasModuleInit(null)).toBe(false);
    expect(hasModuleDestroy({ onModuleDestroy: () => undefined })).toBe(true);
    expect(hasModuleDestroy({})).toBe(false);
  });

  test('runModuleInit calls hooks in order and awaits async hooks', async () => {
    const log: string[] = [];
    const first = {
      async onModuleInit(): Promise<void> {
        await Promise.resolve();
        log.push('first');
      },
    };
    const second = {
      onModuleInit(): void {
        log.push('second');
      },
    };
    const third = { value: 1 };

    await runModuleInit([first, second, third]);

    expect(log).toEqual(['first', 'second']);
  });

  test('runModuleInit stops at the first failing hook', async () => {
    const log: string[] = [];
    const failing = {
      onModuleInit(): void {
        throw new Error('init failed');
      },
    };
    const later = {
      onModuleInit(): void {
        log.push('later');
      },
    };

    await expect(runModuleInit([failing, later])).rejects.toThrow('init failed');
    expect(log).toEqual([]);
  });

  test('runModuleDestroy calls hooks in reverse order', async () => {
    const log: string[] = [];
    const first = {
      onModuleDestroy(): void {
        log.push('first');
      },
    };
    const second = {
      async onModuleDestroy(): Promise<void> {
        await Promise.resolve();
        log.push('second');
      },
    };

    await runModuleDestroy([first, second]);

    expect(log).toEqual(['second', 'first']);
  });

  test('runModuleDestroy runs every hook and aggregates errors', async () => {
    const log: string[] = [];
    const first = {
      onModuleDestroy(): void {
        log.push('first');
      },
    };
    const failing = {
      onModuleDestroy(): void {
        log.push('failing');
        throw new Error('boom');
      },
    };
    const third = {
      onModuleDestroy(): void {
        log.push('third');
      },
    };

    let caught: unknown;
    try {
      await runModuleDestroy([first, failing, third]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const errors = (caught as AggregateError).errors as unknown[];
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
    expect(log).toEqual(['third', 'failing', 'first']);
  });
});
