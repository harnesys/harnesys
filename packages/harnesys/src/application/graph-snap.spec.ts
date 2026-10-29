import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { Snapshot } from '../domain/snapshot.ts';
import { RUNTIME_VERSION } from '../domain/snapshot.ts';
import { abandonForeignSnapshot, decisionTextOf } from './graph-snap.ts';
import { SYNTHETIC_TOOL_RESULT_ABANDONED } from './tool-message.ts';

function snapOf(runId: string, status: string, messages: unknown[]): Snapshot {
  return {
    sessionId: 'session-1',
    runId,
    definitionHash: 'def',
    planHash: 'plan',
    sequence: 3,
    status,
    runtimeVersion: RUNTIME_VERSION,
    initialInput: null,
    state: { messages },
    cursor: {
      nodes: { act: { phase: 'executing', nodeExecutionId: `${runId}:act:0` } },
      budget: { steps: 1, tokens: 0, startedAt: Date.now() },
    },
  };
}

describe('decisionTextOf', () => {
  test('rejected answer carries the note', () => {
    expect(decisionTextOf({ rejected: true, note: 'wrong file' })).toEqual({
      content: 'denied by user: wrong file',
    });
  });

  test('approved false payload denies', () => {
    expect(decisionTextOf({ payload: { approved: false } })).toEqual({
      content: 'denied by user',
    });
  });

  test('approved true payload reports unexecuted approval', () => {
    expect(decisionTextOf({ payload: { approved: true } })?.content).toContain(
      'closed before the call was executed',
    );
  });

  test('non-permission answers keep the abandoned marker', () => {
    expect(decisionTextOf({ payload: { text: 'continue' } })).toBeUndefined();
    expect(decisionTextOf(null)).toBeUndefined();
  });
});

describe('abandonForeignSnapshot', () => {
  test('stamps dangling calls with the recorded decision', async () => {
    const state = new InMemoryRuntimeState('session-1');
    state.hydrate(
      snapOf('run-1', 'needs_input', [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call1', name: 'write_file', arguments: {} }],
        },
      ]),
    );
    await abandonForeignSnapshot(state, 'run-2', {
      content: 'denied by user: wrong file',
    });
    const snap = await state.load();
    expect(snap?.status).toBe('completed');
    const messages = (snap?.state.messages ?? []) as unknown[];
    expect(messages.at(-1)?.role).toBe('tool');
    expect(messages.at(-1)?.content).toBe('denied by user: wrong file');
  });

  test('without a decision falls back to the abandoned marker', async () => {
    const state = new InMemoryRuntimeState('session-1');
    state.hydrate(
      snapOf('run-1', 'running', [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call1', name: 'write_file', arguments: {} }],
        },
      ]),
    );
    await abandonForeignSnapshot(state, 'run-2');
    const snap = await state.load();
    const messages = (snap?.state.messages ?? []) as unknown[];
    expect(messages.at(-1)?.content).toBe(SYNTHETIC_TOOL_RESULT_ABANDONED);
  });

  test('own snapshot is left untouched', async () => {
    const state = new InMemoryRuntimeState('session-1');
    state.hydrate(snapOf('run-2', 'needs_input', []));
    await abandonForeignSnapshot(state, 'run-2', { content: 'denied by user' });
    expect((await state.load())?.status).toBe('needs_input');
  });
});
