import { describe, expect, test } from 'bun:test';
import { duplicateDelivery } from './delivery.ts';

function duplicate(input: Partial<Parameters<typeof duplicateDelivery>[0]>) {
  return duplicateDelivery({
    runId: 'r1',
    seq: 5,
    appliedCeiling: 3,
    queued: false,
    ...input,
  });
}

describe('duplicateDelivery', () => {
  test('an event below the applied ceiling is a duplicate', () => {
    expect(duplicate({ seq: 3 })).toBe(true);
    expect(duplicate({ seq: 1 })).toBe(true);
  });

  test('an event already waiting in the epoch buffer is a duplicate', () => {
    expect(duplicate({ queued: true })).toBe(true);
  });

  test('a new event is applied even when the ceiling lags behind it', () => {
    expect(duplicate({ seq: 4 })).toBe(false);
    expect(duplicate({ seq: 400 })).toBe(false);
  });

  test('events without a run or seq are never deduplicated by the ceiling', () => {
    expect(duplicate({ runId: undefined })).toBe(false);
    expect(duplicate({ seq: undefined })).toBe(false);
  });
});
