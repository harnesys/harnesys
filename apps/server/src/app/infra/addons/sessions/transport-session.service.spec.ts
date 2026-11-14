import { describe, expect, test } from 'bun:test';
import {
  AddonTransportBindingRepositoryPort,
  type AddonTransportBindingRow,
} from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import type { TransportSessionRow } from '../../../domain/addons/transport-session.ts';
import {
  ThreadEventsPort,
  type ThreadRunEvent,
} from '../../../domain/thread/thread-events.port.ts';
import { AddonTransportRegistry } from '../families/transport/transport.family.ts';
import { TransportAskRegistry } from '../families/transport/transport-ask.registry.ts';
import { TransportSessionAsk } from './transport-session.ask.ts';
import { TransportSessionDrafts } from './transport-session.drafts.ts';
import { FakeExecutor, FakeStore, SilentLogger, SlowCalls } from './transport-session.fakes.ts';
import { TransportSessionService } from './transport-session.service.ts';

const ORG = 'org1';
const THREAD = 'thread1';
const RUN = 'run1';
const ADDON = 'addon1';

function bindingRow(): AddonTransportBindingRow {
  return {
    orgId: ORG,
    addonId: ADDON,
    provider: 'telegram',
    externalChatId: 'chat1',
    threadId: THREAD,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function _row(): TransportSessionRow {
  return {
    orgId: ORG,
    addonId: ADDON,
    provider: 'telegram',
    externalChatId: 'chat1',
    threadId: THREAD,
    runId: RUN,
    draft: '',
    lastSeq: 0,
    messageId: null,
    status: 'streaming',
    askId: null,
    askOptionsJson: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

class FakeEvents extends ThreadEventsPort {
  listener: ((orgId: string, event: ThreadRunEvent) => void) | null = null;

  subscribe(listener: (orgId: string, event: ThreadRunEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(orgId: string, event: ThreadRunEvent): void {
    this.listener?.(orgId, event);
  }
}

class FakeBindings extends AddonTransportBindingRepositoryPort {
  override findByThread(orgId: string, threadId: string): AddonTransportBindingRow[] {
    return orgId === ORG && threadId === THREAD ? [bindingRow()] : [];
  }

  override find(): AddonTransportBindingRow | null {
    return null;
  }

  override listByAddon(): AddonTransportBindingRow[] {
    return [];
  }

  override add(): void {}

  override remove(): void {}

  override removeAddon(): void {}
}

class FakeSessionsRepo extends AddonTransportSessionRepositoryPort {
  readonly rows = new Map<string, TransportSessionRow>();

  override find(orgId: string, threadId: string, runId: string, addonId: string) {
    return this.rows.get(`${orgId}/${threadId}/${runId}/${addonId}`) ?? null;
  }

  override findParked(): TransportSessionRow | null {
    return null;
  }

  override open(row: TransportSessionRow): void {
    this.rows.set(`${row.orgId}/${row.threadId}/${row.runId}/${row.addonId}`, row);
  }

  override listOpen(): TransportSessionRow[] {
    return [];
  }

  override patch(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
    patch: Record<string, unknown>,
  ): void {
    const existing = this.find(orgId, threadId, runId, addonId);
    if (existing) {
      Object.assign(existing, patch);
      existing.updatedAt = new Date().toISOString();
    }
  }

  override removeAddon(): void {}

  override rememberOutbound(): void {}

  override isOutbound(): boolean {
    return false;
  }
}

function harness(store: FakeStore): {
  service: TransportSessionService;
  events: FakeEvents;
  calls: SlowCalls;
  repo: FakeSessionsRepo;
} {
  const events = new FakeEvents();
  const calls = new SlowCalls();
  const repo = new FakeSessionsRepo();
  const drafts = new TransportSessionDrafts(
    repo,
    calls,
    new AddonTransportRegistry(),
    new SilentLogger(),
  );
  const service = new TransportSessionService(
    events,
    new FakeBindings(),
    repo,
    drafts,
    {} as TransportSessionAsk,
    new FakeExecutor(store),
    new TransportAskRegistry(),
    new SilentLogger(),
  );
  service.onModuleInit();
  return { service, events, calls, repo };
}

function frame(text: string, seq: number): ThreadRunEvent {
  return {
    type: 'events',
    threadId: THREAD,
    events: [{ type: 'text-delta', text, seq, runId: RUN }],
  };
}

describe('transport session service', () => {
  test('applies frames in emit order even when calls suspend mid-frame', async () => {
    const { events, repo } = harness(new FakeStore([]));
    events.emit(ORG, frame('a', 1));
    events.emit(ORG, frame('b', 2));
    events.emit(ORG, frame('c', 3));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repo.find(ORG, THREAD, RUN, ADDON)?.draft).toBe('abc');
  });

  test('rebuilds the final draft from the run event store on close', async () => {
    const store = new FakeStore([
      { type: 'text-delta', text: 'a', seq: 1, runId: RUN },
      { type: 'text-delta', text: 'b', seq: 2, runId: RUN },
      { type: 'tool', seq: 3, runId: RUN },
      { type: 'text-delta', text: 'c', seq: 4, runId: RUN },
      { type: 'text-delta', text: 'd', seq: 5, runId: RUN },
    ]);
    const { events, repo } = harness(store);
    events.emit(ORG, frame('a', 1));
    events.emit(ORG, frame('b', 2));
    await new Promise((resolve) => setTimeout(resolve, 30));
    events.emit(ORG, { type: 'finished', threadId: THREAD, runId: RUN, status: 'completed' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const row = repo.find(ORG, THREAD, RUN, ADDON);
    expect(row?.status).toBe('closed');
    expect(row?.draft).toBe('abcd');
  });

  test('appends the stopped suffix to the rebuilt draft on cancellation', async () => {
    const store = new FakeStore([{ type: 'text-delta', text: 'ab', seq: 1, runId: RUN }]);
    const { events, repo } = harness(store);
    events.emit(ORG, frame('ab', 1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    events.emit(ORG, { type: 'finished', threadId: THREAD, runId: RUN, status: 'cancelled' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repo.find(ORG, THREAD, RUN, ADDON)?.draft).toBe('ab\n\n[stopped]');
  });

  test('still drops a genuine replayed delta', async () => {
    const { events, repo } = harness(new FakeStore([]));
    events.emit(ORG, frame('a', 1));
    events.emit(ORG, frame('b', 2));
    events.emit(ORG, frame('b-replay', 2));
    events.emit(ORG, frame('c', 3));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repo.find(ORG, THREAD, RUN, ADDON)?.draft).toBe('abc');
  });
});
