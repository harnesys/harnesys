import { describe, expect, test } from 'bun:test';
import { Logger } from '@harnesys/brix';
import type { AddonCallOptions } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import {
  AddonTransportBindingRepositoryPort,
  type AddonTransportBindingRow,
} from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import {
  AddonTransportSessionRepositoryPort,
  type TransportSessionRow,
} from '../../../domain/addons/ports/transport-session-repository.port.ts';
import { LocalExecutorPort } from '../../../domain/thread/local-executor.port.ts';
import { ThreadEventsPort, type ThreadRunEvent } from '../../../domain/thread/thread-events.port.ts';
import { AddonTransportRegistry } from '../families/transport/transport.family.ts';
import { TransportAskRegistry } from '../families/transport/transport-ask.registry.ts';
import { TransportSessionAsk } from './transport-session.ask.ts';
import { TransportSessionDrafts } from './transport-session.drafts.ts';
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

function row(): TransportSessionRow {
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

  override patch(orgId: string, threadId: string, runId: string, addonId: string): void {
    const existing = this.find(orgId, threadId, runId, addonId);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
    }
  }

  override removeAddon(): void {}

  override rememberOutbound(): void {}

  override isOutbound(): boolean {
    return false;
  }
}

class SlowCalls extends AddonCallPort {
  readonly typingCalls: number[] = [];

  override async transportTyping(
    _orgId: string,
    _addonId: string,
    _params: { channel: string; on: boolean },
    _opts?: AddonCallOptions,
  ): Promise<void> {
    this.typingCalls.push(this.typingCalls.length);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  override async transportSend(): Promise<{ messageId?: string }> {
    return {};
  }

  override async transportEdit(): Promise<void> {}
}

function silence(): Logger {
  const noop = async () => {};
  return {
    child: () => ({
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    }),
  } as unknown as Logger;
}

function harness(): {
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
    silence(),
  );
  const service = new TransportSessionService(
    events,
    new FakeBindings(),
    repo,
    drafts,
    {} as TransportSessionAsk,
    {} as LocalExecutorPort,
    new TransportAskRegistry(),
    silence(),
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
    const { events, repo } = harness();
    events.emit(ORG, frame('a', 1));
    events.emit(ORG, frame('b', 2));
    events.emit(ORG, frame('c', 3));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repo.find(ORG, THREAD, RUN, ADDON)?.draft).toBe('abc');
  });

  test('still drops a genuine replayed delta', async () => {
    const { events, repo } = harness();
    events.emit(ORG, frame('a', 1));
    events.emit(ORG, frame('b', 2));
    events.emit(ORG, frame('b-replay', 2));
    events.emit(ORG, frame('c', 3));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repo.find(ORG, THREAD, RUN, ADDON)?.draft).toBe('abc');
  });
});
