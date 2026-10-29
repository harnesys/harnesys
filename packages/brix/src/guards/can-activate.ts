import 'reflect-metadata';
import { IS_PUBLIC_KEY } from './decorators';

export interface GuardStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export interface GuardContext {
  request: Request;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export type GuardResult = boolean | Response;

export type GuardOutcome =
  | { kind: 'allowed' }
  | { kind: 'denied' }
  | { kind: 'response'; response: Response };

export abstract class CanActivate {
  abstract canActivate(ctx: GuardContext): GuardResult | Promise<GuardResult>;
}

function mapStore(): GuardStore {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
}

export function createGuardContext(request: Request, store?: GuardStore): GuardContext {
  const backing = store ?? mapStore();
  return {
    request,
    get<T>(key: string): T | undefined {
      return backing.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      backing.set(key, value);
    },
  };
}

export async function runGuards(ctx: GuardContext, guards: CanActivate[]): Promise<GuardOutcome> {
  if (ctx.get<boolean>(IS_PUBLIC_KEY) === true) {
    return { kind: 'allowed' };
  }
  for (const guard of guards) {
    const result = await guard.canActivate(ctx);
    if (result === true) {
      continue;
    }
    if (result === false) {
      return { kind: 'denied' };
    }
    return { kind: 'response', response: result };
  }
  return { kind: 'allowed' };
}
