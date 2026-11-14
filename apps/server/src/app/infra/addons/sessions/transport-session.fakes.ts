import { Logger } from '@harnesys/brix';
import type { RunEventStore, SessionEvent, TruncateThreadResult } from 'harnesys';
import type { AddonCallOptions } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { LocalExecutorPort } from '../../../domain/thread/local-executor.port.ts';

export class SlowCalls extends AddonCallPort {
  readonly typingCalls: number[] = [];

  override callTool(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override callRoute(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override triggerStart(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override triggerStop(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override jobRun(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override workerStart(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override workerStop(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override hookDeliver(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  override sourceRequest(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

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

export class SilentLogger extends Logger {
  override child(): Logger {
    return this;
  }

  override info(): void {}
  override debug(): void {}
  override warn(): void {}
  override error(): void {}
}

export class FakeStore implements RunEventStore {
  constructor(readonly events: unknown[]) {}

  tail(_runId: string, fromSeq: number): Promise<SessionEvent[]> {
    return Promise.resolve(
      (this.events as Array<{ seq?: number }>).filter(
        (event) => (event.seq ?? 0) > fromSeq,
      ) as SessionEvent[],
    );
  }

  next(): number {
    throw new Error('not used');
  }
  append(): Promise<SessionEvent[]> {
    return Promise.reject(new Error('not used'));
  }
  latestSeq(): Promise<number> {
    return Promise.reject(new Error('not used'));
  }
  listByThread(): Promise<SessionEvent[]> {
    return Promise.reject(new Error('not used'));
  }
  hasRun(): Promise<boolean> {
    return Promise.reject(new Error('not used'));
  }
  appendForThread(): SessionEvent[] {
    throw new Error('not used');
  }
  truncateThreadFrom(): Promise<TruncateThreadResult> {
    return Promise.reject(new Error('not used'));
  }
  removeEvent(): Promise<SessionEvent | null> {
    return Promise.reject(new Error('not used'));
  }
}

export class FakeExecutor extends LocalExecutorPort {
  constructor(private readonly store: RunEventStore) {
    super();
  }

  override events(): Promise<RunEventStore> {
    return Promise.resolve(this.store);
  }

  lifecycle(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  sessionFor(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  send(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  compact(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  drainMessageQueue(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  cancel(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  retry(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  truncateThreadFrom(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  removeThreadEvent(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  stream(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  tickWaitTimers(): Promise<number> {
    return Promise.reject(new Error('not used'));
  }
  countWaitingTimers(): Promise<number> {
    return Promise.reject(new Error('not used'));
  }
  listMcpServers(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  invalidateRuntime(): Promise<void> {
    return Promise.reject(new Error('not used'));
  }
}
