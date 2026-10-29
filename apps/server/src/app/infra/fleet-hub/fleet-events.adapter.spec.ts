import { describe, expect, test } from 'bun:test';
import { FleetEventsAdapter } from './fleet-events.adapter.ts';

describe('FleetEventsAdapter', () => {
  test('emits to all subscribers', () => {
    const events = new FleetEventsAdapter();
    const received: string[] = [];
    const unsubscribeA = events.subscribe((orgId) => received.push(`a:${orgId}`));
    const unsubscribeB = events.subscribe((orgId) => received.push(`b:${orgId}`));

    events.emit('org-1');

    expect(received).toEqual(['a:org-1', 'b:org-1']);
    unsubscribeA();
    unsubscribeB();
  });

  test('removing a subscriber stops delivery', () => {
    const events = new FleetEventsAdapter();
    const received: string[] = [];
    const unsubscribe = events.subscribe((orgId) => received.push(orgId));

    unsubscribe();
    events.emit('org-2');

    expect(received).toEqual([]);
  });

  test('listener errors do not break fan-out', () => {
    const events = new FleetEventsAdapter();
    const received: string[] = [];
    events.subscribe(() => {
      throw new Error('listener failure');
    });
    events.subscribe((orgId) => received.push(orgId));

    events.emit('org-3');

    expect(received).toEqual(['org-3']);
  });
});
