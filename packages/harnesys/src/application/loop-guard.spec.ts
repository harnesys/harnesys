import { describe, expect, test } from 'bun:test';
import {
  createLoopGuardState,
  NUDGE_AFTER_IDENTICAL_CALLS,
  recordToolCall,
  STOP_AFTER_IDENTICAL_CALLS,
  toolCallSignature,
} from './loop-guard.ts';

describe('loop guard', () => {
  test('signature ignores key order and streak drives nudge and stop', () => {
    expect(toolCallSignature('read', { path: 'a', offset: 1 })).toBe(
      toolCallSignature('read', { offset: 1, path: 'a' }),
    );
    expect(toolCallSignature('read', { path: 'a' })).not.toBe(
      toolCallSignature('read', { path: 'b' }),
    );

    const guard = createLoopGuardState();
    const sig = toolCallSignature('read', { path: 'a' });
    for (let i = 0; i < NUDGE_AFTER_IDENTICAL_CALLS; i += 1) {
      recordToolCall(guard, 'read', sig);
    }
    expect(guard.streak).toBe(NUDGE_AFTER_IDENTICAL_CALLS);

    for (let i = 0; i < STOP_AFTER_IDENTICAL_CALLS - NUDGE_AFTER_IDENTICAL_CALLS; i += 1) {
      recordToolCall(guard, 'read', sig);
    }
    expect(guard.streak).toBe(STOP_AFTER_IDENTICAL_CALLS);

    recordToolCall(guard, 'read', toolCallSignature('read', { path: 'b' }));
    expect(guard.streak).toBe(1);
    expect(guard.tool).toBe('read');
  });
});
