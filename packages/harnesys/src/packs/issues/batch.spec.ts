import { expect, test } from 'bun:test';
import { runBatch } from './batch.ts';

test('runBatch applies every entry in order and reports failures per entry', async () => {
  const applied: number[] = [];
  const outcome = await runBatch(
    [1, 2, 3],
    'moves',
    async (n) => {
      applied.push(n);
      if (n === 2) {
        throw new Error('boom');
      }
      return n * 10;
    },
    (n, error) => ({ n, error }),
  );
  expect(applied).toEqual([1, 2, 3]);
  expect(outcome.done).toBe(2);
  expect(outcome.items).toEqual([10, 30]);
  expect(outcome.failed).toEqual([{ n: 2, error: 'boom' }]);
});

test('runBatch rejects an empty batch', async () => {
  await expect(
    runBatch(
      [],
      'moves',
      async (n: number) => n,
      (n) => ({ n }),
    ),
  ).rejects.toThrow('moves is empty');
});
