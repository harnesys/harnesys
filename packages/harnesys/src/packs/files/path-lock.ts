const locks = new Map<string, Promise<unknown>>();

export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const result = previous.then(fn, fn);
  locks.set(key, result);
  const cleanup = (): void => {
    if (locks.get(key) === result) {
      locks.delete(key);
    }
  };
  result.then(cleanup, cleanup);
  return result;
}
