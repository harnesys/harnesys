import { Inject, Injectable } from '@harnesys/brix';
import type { EventsWatchFrame } from '../../domain/events-watch/events-watch-frame.ts';
import type { EventsWatchSubscription } from '../../domain/events-watch/events-watch-hub.port.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { buildResyncFrame } from './events-watch.frames.ts';

export const EVENTS_WATCH_HUB_OPTIONS = Symbol('EventsWatchHubOptions');

const DEFAULT_MAX_FRAMES = 4096;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_SUBSCRIBER_FRAMES = 4096;

export interface EventsWatchHubOptions {
  maxFrames?: number;
  maxBytes?: number;
  maxSubscriberFrames?: number;
}

interface OrgState {
  orgId: string;
  seq: number;
  ring: EventsWatchFrame[];
  bytes: number;
  subscribers: Set<HubSubscription>;
}

class HubSubscription {
  private readonly queue: EventsWatchFrame[] = [];
  private closed = false;

  constructor(
    private readonly orgId: string,
    private readonly maxFrames: number,
    private readonly notify?: () => void,
  ) {}

  push(frame: EventsWatchFrame, latestSeq: number): boolean {
    if (this.closed) {
      return false;
    }
    if (this.queue.length >= this.maxFrames) {
      this.queue.length = 0;
      this.queue.push(buildResyncFrame(this.orgId, latestSeq, 'slow'));
      this.notify?.();
      return false;
    }
    this.queue.push(frame);
    this.notify?.();
    return true;
  }

  drain(): EventsWatchFrame[] {
    if (this.queue.length === 0) {
      return [];
    }
    return this.queue.splice(0);
  }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
  }
}

@Injectable()
export class EventsWatchHub extends EventsWatchHubPort {
  private readonly states = new Map<string, OrgState>();
  private readonly maxFrames: number;
  private readonly maxBytes: number;
  private readonly maxSubscriberFrames: number;

  constructor(@Inject(EVENTS_WATCH_HUB_OPTIONS) options: EventsWatchHubOptions = {}) {
    super();
    this.maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxSubscriberFrames = options.maxSubscriberFrames ?? DEFAULT_MAX_SUBSCRIBER_FRAMES;
  }

  publish(orgId: string, topic: string, data: unknown): void {
    const state = this.stateOf(orgId);
    state.seq += 1;
    const frame: EventsWatchFrame = { seq: state.seq, topic, data: JSON.stringify(data) };
    this.append(state, frame);
    for (const subscriber of state.subscribers) {
      subscriber.push(frame, state.seq);
    }
  }

  subscribe(orgId: string, fromSeq?: number, onPush?: () => void): EventsWatchSubscription {
    const state = this.stateOf(orgId);
    const subscriber = new HubSubscription(orgId, this.maxSubscriberFrames, onPush);
    state.subscribers.add(subscriber);
    if (fromSeq !== undefined) {
      this.replay(state, subscriber, fromSeq);
    }
    return {
      drain: () => subscriber.drain(),
      close: () => {
        subscriber.close();
        state.subscribers.delete(subscriber);
      },
    };
  }

  private replay(state: OrgState, subscriber: HubSubscription, fromSeq: number): void {
    const cursor = Math.floor(fromSeq);
    if (!Number.isFinite(cursor) || cursor < 0 || cursor > state.seq) {
      const reason = cursor > state.seq ? 'ahead' : 'gap';
      subscriber.push(buildResyncFrame(state.orgId, state.seq, reason), state.seq);
      return;
    }
    const oldest = state.ring[0]?.seq;
    if (oldest === undefined) {
      if (cursor < state.seq) {
        subscriber.push(buildResyncFrame(state.orgId, state.seq, 'gap'), state.seq);
      }
      return;
    }
    if (cursor < oldest - 1) {
      subscriber.push(buildResyncFrame(state.orgId, state.seq, 'gap'), state.seq);
      return;
    }
    for (const frame of state.ring) {
      if (frame.seq <= cursor) {
        continue;
      }
      if (!subscriber.push(frame, state.seq)) {
        break;
      }
    }
  }

  private append(state: OrgState, frame: EventsWatchFrame): void {
    state.ring.push(frame);
    state.bytes += frameBytes(frame);
    while (state.ring.length > this.maxFrames || state.bytes > this.maxBytes) {
      const evicted = state.ring.shift();
      if (!evicted) {
        break;
      }
      state.bytes -= frameBytes(evicted);
    }
  }

  private stateOf(orgId: string): OrgState {
    let state = this.states.get(orgId);
    if (!state) {
      state = { orgId, seq: 0, ring: [], bytes: 0, subscribers: new Set() };
      this.states.set(orgId, state);
    }
    return state;
  }
}

function frameBytes(frame: EventsWatchFrame): number {
  return Buffer.byteLength(frame.topic) + Buffer.byteLength(frame.data);
}
