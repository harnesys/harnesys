export interface CallQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createCallQueue(): CallQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
