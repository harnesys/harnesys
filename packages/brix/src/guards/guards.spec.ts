import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Container } from '../di/container';
import { Module } from '../di/module';
import { Controller } from '../http/controller';
import { buildHono } from '../http/hono-adapter';
import { Get } from '../http/routes';
import type { GuardContext, GuardStore } from './can-activate';
import { CanActivate, createGuardContext, runGuards } from './can-activate';
import {
  APP_GUARD,
  getGuardClasses,
  IS_PUBLIC_KEY,
  isPublic,
  Public,
  UseGuards,
} from './decorators';

function trackingGuard(name: string, result: boolean, log: string[]): CanActivate {
  return new (class extends CanActivate {
    canActivate(): boolean {
      log.push(name);
      return result;
    }
  })();
}

function asyncGuard(name: string, log: string[]): CanActivate {
  return new (class extends CanActivate {
    async canActivate(): Promise<boolean> {
      await Promise.resolve();
      log.push(name);
      return true;
    }
  })();
}

function testContext(): GuardContext {
  return createGuardContext(new Request('http://localhost/api/items'));
}

class AllowGuard extends CanActivate {
  canActivate(): boolean {
    return true;
  }
}

class DenyGuard extends CanActivate {
  canActivate(): boolean {
    return false;
  }
}

describe('runGuards', () => {
  test('runs guards in order and stops at the first denial', async () => {
    const log: string[] = [];
    const ctx = testContext();
    const outcome = await runGuards(ctx, [
      trackingGuard('first', true, log),
      trackingGuard('second', false, log),
      trackingGuard('third', true, log),
    ]);

    expect(outcome).toEqual({ kind: 'denied' });
    expect(log).toEqual(['first', 'second']);
  });

  test('returns allowed when every guard allows, including async guards', async () => {
    const log: string[] = [];
    const ctx = testContext();
    const outcome = await runGuards(ctx, [
      trackingGuard('first', true, log),
      asyncGuard('second', log),
    ]);

    expect(outcome).toEqual({ kind: 'allowed' });
    expect(log).toEqual(['first', 'second']);
  });

  test('guard returning a Response produces a response outcome with that response', async () => {
    const response = new Response('teapot', { status: 418 });
    class ResponderGuard extends CanActivate {
      canActivate(): Response {
        return response;
      }
    }

    const outcome = await runGuards(testContext(), [new ResponderGuard()]);

    expect(outcome.kind).toBe('response');
    if (outcome.kind === 'response') {
      expect(outcome.response).toBe(response);
    }
  });

  test('guard exceptions propagate to the caller', async () => {
    class ThrowingGuard extends CanActivate {
      canActivate(): boolean {
        throw new Error('boom');
      }
    }

    let message = '';
    try {
      await runGuards(testContext(), [new ThrowingGuard()]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('boom');
  });

  test('guard writes land in the provided store so handlers can read them', () => {
    const store = new Map<string, unknown>();
    const backing: GuardStore = {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
    };
    const ctx = createGuardContext(new Request('http://localhost/api/items'), backing);

    ctx.set('user', { id: 1 });

    expect(store.get('user')).toEqual({ id: 1 });
    expect(ctx.get<{ id: number }>('user')).toEqual({ id: 1 });
  });

  test('Public() metadata makes runGuards allow without calling guards', async () => {
    class OrdersController {
      @Public()
      list(): object {
        return {};
      }

      getOne(): object {
        return {};
      }
    }

    @Public()
    class PublicController {
      list(): object {
        return {};
      }
    }

    expect(isPublic(OrdersController, 'list')).toBe(true);
    expect(isPublic(OrdersController, 'getOne')).toBe(false);
    expect(isPublic(PublicController, 'list')).toBe(true);

    const log: string[] = [];
    const ctx = testContext();
    if (isPublic(OrdersController, 'list')) {
      ctx.set(IS_PUBLIC_KEY, true);
    }
    const outcome = await runGuards(ctx, [trackingGuard('deny', false, log)]);

    expect(outcome).toEqual({ kind: 'allowed' });
    expect(log).toEqual([]);
  });
});

describe('guard metadata', () => {
  test('UseGuards merges class-level guards before method-level guards', () => {
    @UseGuards(AllowGuard)
    class ThreadsController {
      @UseGuards(DenyGuard)
      list(): object {
        return {};
      }
    }

    expect(getGuardClasses(ThreadsController, 'list')).toEqual([AllowGuard, DenyGuard]);
  });

  test('guard classes and APP_GUARD resolve from the container', () => {
    const container = new Container();
    container.register(AllowGuard);
    container.register({ provide: APP_GUARD, useClass: DenyGuard });

    expect(container.resolve<CanActivate>(AllowGuard)).toBeInstanceOf(AllowGuard);
    expect(container.resolve<CanActivate>(AllowGuard)).toBe(
      container.resolve<CanActivate>(AllowGuard),
    );
    expect(container.resolve<CanActivate>(APP_GUARD)).toBeInstanceOf(DenyGuard);
  });

  test('GuardContext carries the request and a per-request store', () => {
    const request = new Request('http://localhost/api/items');
    const ctx = createGuardContext(request);

    expect(ctx.request).toBe(request);
    ctx.set<string>('traceId', 'abc');
    expect(ctx.get<string>('traceId')).toBe('abc');
    expect(ctx.get<string>('missing')).toBeUndefined();
  });

  test('public routes wire without instantiating any guard', () => {
    class ExplodingGuard extends CanActivate {
      constructor() {
        super();
        throw new Error('must not instantiate for public routes');
      }

      canActivate(): boolean {
        return false;
      }
    }

    @Controller('open')
    class OpenController {
      @Get()
      @Public()
      @UseGuards(ExplodingGuard)
      list(): object {
        return {};
      }
    }

    @Module({
      controllers: [OpenController],
      providers: [{ provide: APP_GUARD, useClass: ExplodingGuard }],
    })
    class OpenModule {}

    expect(() => buildHono({ modules: [OpenModule], container: new Container() })).not.toThrow();
  });

  test('protected routes still instantiate their guards at wiring time', () => {
    class ExplodingGuard extends CanActivate {
      constructor() {
        super();
        throw new Error('must not instantiate for public routes');
      }

      canActivate(): boolean {
        return false;
      }
    }

    @Controller('closed')
    class ClosedController {
      @Get()
      @UseGuards(ExplodingGuard)
      list(): object {
        return {};
      }
    }

    @Module({ controllers: [ClosedController] })
    class ClosedModule {}

    expect(() => buildHono({ modules: [ClosedModule], container: new Container() })).toThrow(
      'must not instantiate',
    );
  });
});
