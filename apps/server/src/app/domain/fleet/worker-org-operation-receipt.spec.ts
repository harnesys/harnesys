import { describe, expect, test } from 'bun:test';

function applyReceipt(
  store: Map<string, unknown>,
  runId: string,
  operationId: string,
  compute: () => unknown,
): unknown {
  const key = `${runId}:${operationId}`;
  const existing = store.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const result = compute();
  store.set(key, result);
  return result;
}

describe('worker org operation receipt', () => {
  test('duplicate operationId returns first result', () => {
    const store = new Map<string, unknown>();
    let calls = 0;
    const first = applyReceipt(store, 'run-a', 'op-1', () => {
      calls += 1;
      return { ok: true, n: calls };
    });
    const second = applyReceipt(store, 'run-a', 'op-1', () => {
      calls += 1;
      return { ok: true, n: calls };
    });
    expect(first).toEqual({ ok: true, n: 1 });
    expect(second).toEqual({ ok: true, n: 1 });
    expect(calls).toBe(1);
  });

  test('different operationId computes fresh result', () => {
    const store = new Map<string, unknown>();
    let calls = 0;
    applyReceipt(store, 'run-a', 'op-1', () => {
      calls += 1;
      return { n: calls };
    });
    const next = applyReceipt(store, 'run-a', 'op-2', () => {
      calls += 1;
      return { n: calls };
    });
    expect(next).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });
});
