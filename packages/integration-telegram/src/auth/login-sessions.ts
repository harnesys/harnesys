import { LOGIN_TTL_MS } from '../db/schema.ts';

export type LoginInputKind = 'code' | 'password';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface PendingLogin {
  readerId: string;
  phone: string;
  apiId: number;
  apiHash: string;
  createdAt: number;
  waiting: LoginInputKind | null;
  input: Deferred<string> | null;
  early: { kind: LoginInputKind; value: string } | null;
  failure: Error | null;
}

export class LoginSessions {
  private readonly sessions = new Map<string, PendingLogin>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  open(readerId: string, input: { phone: string; apiId: number; apiHash: string }): PendingLogin {
    this.close(readerId, new Error('A newer login attempt replaced this one'));
    const timer = setTimeout(() => {
      this.timers.delete(readerId);
      this.close(readerId, new Error('Login attempt expired'));
    }, LOGIN_TTL_MS);
    this.timers.set(readerId, timer);
    const session: PendingLogin = {
      readerId,
      ...input,
      createdAt: Date.now(),
      waiting: null,
      input: null,
      early: null,
      failure: null,
    };
    this.sessions.set(readerId, session);
    return session;
  }

  get(readerId: string): PendingLogin | undefined {
    const session = this.sessions.get(readerId);
    if (!session) {
      return undefined;
    }
    if (Date.now() - session.createdAt > LOGIN_TTL_MS) {
      this.close(readerId, new Error('Login attempt expired'));
      return undefined;
    }
    return session;
  }

  waitFor(readerId: string, kind: LoginInputKind): Promise<string> {
    const session = this.sessions.get(readerId);
    if (!session) {
      throw new Error(`No pending login for reader ${readerId}`);
    }
    const early = session.early;
    if (early && early.kind === kind) {
      session.early = null;
      return Promise.resolve(early.value);
    }
    const input = deferred<string>();
    session.waiting = kind;
    session.input = input;
    return input.promise;
  }

  submit(readerId: string, kind: LoginInputKind, value: string): boolean {
    const session = this.sessions.get(readerId);
    if (!session) {
      return false;
    }
    if (session.input && session.waiting === kind) {
      session.input.resolve(value);
      session.input = null;
      session.waiting = null;
      return true;
    }
    session.early = { kind, value };
    return true;
  }

  close(readerId: string, reason: Error): void {
    const timer = this.timers.get(readerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(readerId);
    }
    const session = this.sessions.get(readerId);
    if (!session) {
      return;
    }
    session.input?.reject(reason);
    this.sessions.delete(readerId);
  }

  isWaiting(readerId: string): LoginInputKind | null {
    return this.sessions.get(readerId)?.waiting ?? null;
  }
}
