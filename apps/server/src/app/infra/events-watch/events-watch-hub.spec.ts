import { describe, expect, test } from 'bun:test';
import type { EventsWatchResyncFrame } from '@harnesys/studio-shared';
import type { EventsWatchFrame } from './events-watch.frames.ts';
import { EventsWatchHub } from './events-watch-hub.ts';

function resyncOf(frames: EventsWatchFrame[]): EventsWatchResyncFrame {
  const frame = frames[0];
  if (!frame) {
    throw new Error('missing resync frame');
  }
  return JSON.parse(frame.data) as EventsWatchResyncFrame;
}

describe('EventsWatchHub', () => {
  test('publishes monotonic sequence numbers to live subscribers', () => {
    const hub = new EventsWatchHub();
    const subscription = hub.subscribe('org-a');

    hub.publish('org-a', 'desk', { n: 1 });
    hub.publish('org-a', 'desk', { n: 2 });

    expect(subscription.drain().map((frame) => frame.seq)).toEqual([1, 2]);
  });

  test('replays frames after the client cursor', () => {
    const hub = new EventsWatchHub();
    hub.publish('org-a', 'desk', { n: 1 });
    hub.publish('org-a', 'desk', { n: 2 });
    hub.publish('org-a', 'desk', { n: 3 });

    const subscription = hub.subscribe('org-a', 1);

    expect(subscription.drain().map((frame) => frame.seq)).toEqual([2, 3]);
  });

  test('emits a resync when the cursor is older than the ring', () => {
    const hub = new EventsWatchHub({ maxFrames: 2 });
    hub.publish('org-a', 'desk', { n: 1 });
    hub.publish('org-a', 'desk', { n: 2 });
    hub.publish('org-a', 'desk', { n: 3 });

    const frames = hub.subscribe('org-a', 0).drain();

    expect(frames).toHaveLength(1);
    expect(frames[0]?.topic).toBe('resync');
    expect(resyncOf(frames)).toEqual({ orgId: 'org-a', latestSeq: 3, reason: 'gap' });
  });

  test('keeps organizations isolated', () => {
    const hub = new EventsWatchHub();
    const orgA = hub.subscribe('org-a', 0);
    const orgB = hub.subscribe('org-b', 0);

    hub.publish('org-a', 'desk', { org: 'a' });
    hub.publish('org-b', 'desk', { org: 'b' });

    expect(orgA.drain().map((frame) => frame.seq)).toEqual([1]);
    expect(orgB.drain().map((frame) => frame.seq)).toEqual([1]);
  });

  test('caps a slow subscriber queue and replaces it with one resync', () => {
    const hub = new EventsWatchHub({ maxSubscriberFrames: 2 });
    const subscription = hub.subscribe('org-a');

    hub.publish('org-a', 'desk', { n: 1 });
    hub.publish('org-a', 'desk', { n: 2 });
    hub.publish('org-a', 'desk', { n: 3 });

    const frames = subscription.drain();

    expect(frames).toHaveLength(1);
    expect(frames[0]?.topic).toBe('resync');
    expect(resyncOf(frames)).toEqual({ orgId: 'org-a', latestSeq: 3, reason: 'slow' });
  });

  test('emits a resync when the cursor is ahead of the latest frame', () => {
    const hub = new EventsWatchHub();
    hub.publish('org-a', 'desk', { n: 1 });
    hub.publish('org-a', 'desk', { n: 2 });

    const frames = hub.subscribe('org-a', 5).drain();

    expect(frames).toHaveLength(1);
    expect(frames[0]?.topic).toBe('resync');
    expect(resyncOf(frames)).toEqual({ orgId: 'org-a', latestSeq: 2, reason: 'ahead' });
  });

  test('evicts frames over the byte budget and resyncs the gap', () => {
    const hub = new EventsWatchHub({ maxBytes: 32 });
    hub.publish('org-a', 'desk', { payload: 'x'.repeat(64) });

    const frames = hub.subscribe('org-a', 0).drain();

    expect(frames).toHaveLength(1);
    expect(resyncOf(frames)).toEqual({ orgId: 'org-a', latestSeq: 1, reason: 'gap' });
  });
});
