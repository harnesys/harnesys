import { describe, expect, test } from 'bun:test';
import { triggerTaskText } from '@harnesys/studio-shared';
import { MemoryThreads, memoryThread } from './thread.fakes.ts';
import { applyDerivedThreadTitle, DEFAULT_THREAD_TITLE } from './thread.helpers.ts';

function threadsWith(title: string): MemoryThreads {
  const threads = new MemoryThreads();
  threads.seed(memoryThread({ id: 't1', title }));
  return threads;
}

describe('applyDerivedThreadTitle', () => {
  test('names an untitled chat after the trigger label, not the trigger tag', () => {
    const threads = threadsWith(DEFAULT_THREAD_TITLE);
    applyDerivedThreadTitle({
      threads,
      orgId: 'org-1',
      thread: { id: 't1', kind: 'chat', title: DEFAULT_THREAD_TITLE },
      text: triggerTaskText({
        addonId: 'harnesys.webhook',
        triggerId: 'webhook.http',
        label: 'Release hook',
        title: 'Release hook',
        text: 'body',
      }),
    });
    expect(threads.rows.get('t1')?.title).toBe('Release hook');
  });

  test('keeps a title the user already set', () => {
    const threads = threadsWith('My thread');
    applyDerivedThreadTitle({
      threads,
      orgId: 'org-1',
      thread: { id: 't1', kind: 'chat', title: 'My thread' },
      text: triggerTaskText({
        addonId: 'harnesys.webhook',
        triggerId: 'webhook.http',
        label: 'Release hook',
        text: 'body',
      }),
    });
    expect(threads.rows.get('t1')?.title).toBe('My thread');
  });

  test('falls back to the message text for plain messages', () => {
    const threads = threadsWith(DEFAULT_THREAD_TITLE);
    applyDerivedThreadTitle({
      threads,
      orgId: 'org-1',
      thread: { id: 't1', kind: 'chat', title: DEFAULT_THREAD_TITLE },
      text: 'Hello there',
    });
    expect(threads.rows.get('t1')?.title).toBe('Hello there');
  });
});
