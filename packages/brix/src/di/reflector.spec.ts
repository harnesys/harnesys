import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Reflector, SetMetadata } from './reflector';

describe('SetMetadata and Reflector', () => {
  @SetMetadata('roles', ['admin'])
  class OrdersController {
    @SetMetadata('roles', ['editor'])
    @SetMetadata('public', true)
    update(): object {
      return {};
    }

    list(): object {
      return {};
    }
  }

  test('reads method-level metadata by key and handler name', () => {
    const reflector = new Reflector();

    expect(reflector.get<boolean>('public', OrdersController, 'update')).toBe(true);
    expect(reflector.get<string[]>('roles', OrdersController, 'update')).toEqual(['editor']);
  });

  test('method-level value wins over class-level value', () => {
    const reflector = new Reflector();

    expect(reflector.get<string[]>('roles', OrdersController, 'list')).toEqual(['admin']);
  });

  test('missing key returns undefined and class-level works without a handler', () => {
    const reflector = new Reflector();

    expect(reflector.get('absent', OrdersController, 'update')).toBeUndefined();
    expect(reflector.get<string[]>('roles', OrdersController)).toEqual(['admin']);
    expect(reflector.get('public', OrdersController)).toBeUndefined();
  });

  test('getAll merges class-level and method-level arrays in order', () => {
    @SetMetadata('tags', ['base'])
    class TagsController {
      @SetMetadata('tags', ['extra'])
      run(): object {
        return {};
      }
    }

    const reflector = new Reflector();

    expect(reflector.getAll<string>('tags', TagsController, 'run')).toEqual(['base', 'extra']);
    expect(reflector.getAll<string>('tags', TagsController)).toEqual(['base']);
    expect(reflector.getAll<string>('absent', TagsController, 'run')).toEqual([]);
  });

  test('getAll wraps a scalar metadata value into an array', () => {
    class ScalarController {
      @SetMetadata('scope', 'tenant')
      run(): object {
        return {};
      }
    }

    const reflector = new Reflector();

    expect(reflector.getAll<string>('scope', ScalarController, 'run')).toEqual(['tenant']);
  });
});
