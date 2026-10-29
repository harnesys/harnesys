import { afterEach, describe, expect, test } from 'bun:test';
import type { PendingSessionEvent, SessionEvent } from 'harnesys';
import {
  approve,
  buildStack,
  counts,
  installModelScript,
  restoreFetch,
  type Stack,
  snapshotStatus,
  THREAD_ID,
} from './permission-resume-cycle.fakes.ts';

afterEach(() => {
  restoreFetch();
});

async function waitFor(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function parkUntil(
  stack: Stack,
  runId: string,
  text: string | null,
): Promise<{ askId: string; toolCallId: string }> {
  if (text !== null) {
    const userEvent = { type: 'user', text } as PendingSessionEvent;
    await stack.lifecycle.create({ runId, threadId: THREAD_ID }, [userEvent]);
  }
  stack.claimer.kick();
  await waitFor(async () => {
    const rec = await stack.lifecycle.get(runId);
    return rec?.status === 'needs_input' || rec?.status === 'completed' || rec?.status === 'failed';
  }, 'run to settle');
  const tail = await stack.events.tail(runId, 0);
  const ask = [...tail].reverse().find((ev) => ev.type === 'ask') as
    | Extract<SessionEvent, { type: 'ask' }>
    | undefined;
  if (!ask) {
    const rec = await stack.lifecycle.get(runId);
    throw new Error(
      `no ask parked (status ${rec?.status}); events: ${tail.map((ev) => ev.type).join(',')}`,
    );
  }
  return { askId: ask.askId, toolCallId: ask.tool?.toolCallId ?? '' };
}

async function askIds(stack: Stack, runId: string): Promise<string[]> {
  const tail = await stack.events.tail(runId, 0);
  return tail
    .filter((ev) => ev.type === 'ask')
    .map((a) => (a as Extract<SessionEvent, { type: 'ask' }>).askId);
}

describe('hitl permission resume through claimer and engine', () => {
  test('allow once: approved call executes exactly once and is not re-asked', async () => {
    counts.spawn = 0;
    installModelScript([{ name: 'spawn_thing', args: { q: 1 } }, null]);
    const stack = buildStack();
    const runId = crypto.randomUUID();
    try {
      const first = await parkUntil(stack, runId, 'go');
      expect(counts.spawn).toBe(0);
      expect(first.toolCallId).toBe('call_1');
      await approve(stack, runId, first.askId, { approved: true, scope: 'once' });
      await waitFor(async () => {
        const rec = await stack.lifecycle.get(runId);
        return rec?.status === 'completed';
      }, 'run to complete after approval');
      expect(counts.spawn).toBe(1);
      expect(await askIds(stack, runId)).toHaveLength(1);
      const tail = await stack.events.tail(runId, 0);
      const completed = tail.filter(
        (ev) =>
          ev.type === 'tool' &&
          (ev as Extract<SessionEvent, { type: 'tool' }>).phase === 'completed',
      );
      expect(completed).toHaveLength(1);
    } finally {
      stack.claimer.stop();
    }
  });

  test('allow run: grant survives park/resume and silences later asks for the operation', async () => {
    counts.spawn = 0;
    counts.deploy = 0;
    installModelScript([
      { name: 'spawn_thing', args: { q: 1 } },
      { name: 'deploy_thing', args: { q: 2 } },
      { name: 'spawn_thing', args: { q: 3 } },
      null,
    ]);
    const stack = buildStack();
    const runId = crypto.randomUUID();
    try {
      const first = await parkUntil(stack, runId, 'go');
      expect(counts.spawn).toBe(0);
      await approve(stack, runId, first.askId, { approved: true, scope: 'run' });
      const second = await parkUntil(stack, runId, null);
      expect(counts.spawn).toBe(1);
      expect(second.toolCallId).toBe('call_2');
      await approve(stack, runId, second.askId, { approved: true, scope: 'once' });
      await waitFor(async () => {
        const rec = await stack.lifecycle.get(runId);
        return rec?.status === 'completed' || rec?.status === 'failed';
      }, 'run to complete after second approval');
      expect(counts.spawn).toBe(2);
      expect(counts.deploy).toBe(1);
      expect(await askIds(stack, runId)).toHaveLength(2);
      expect((await stack.lifecycle.get(runId))?.status).toBe('completed');
    } finally {
      stack.claimer.stop();
    }
  });

  test('resume reuses the parked interrupt id across segments', async () => {
    counts.spawn = 0;
    installModelScript([{ name: 'spawn_thing', args: { q: 1 } }, null]);
    const stack = buildStack();
    const runId = crypto.randomUUID();
    try {
      const first = await parkUntil(stack, runId, 'go');
      expect(snapshotStatus(runId)).toBe('needs_input');
      expect(first.askId).toBe(`perm/${runId}:act:2/0`);
      await approve(stack, runId, first.askId, { approved: true, scope: 'once' });
      await waitFor(async () => {
        const rec = await stack.lifecycle.get(runId);
        return rec?.status === 'completed';
      }, 'run to complete');
      expect(await askIds(stack, runId)).toEqual([first.askId]);
      expect(counts.spawn).toBe(1);
    } finally {
      stack.claimer.stop();
    }
  });
});
