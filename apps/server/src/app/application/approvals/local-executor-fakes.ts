import type { SessionHandle } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export class StubLocalExecutor extends LocalExecutorPort {
  lifecycle(): Promise<never> {
    return Promise.reject(new Error('no runtime'));
  }

  events(): never {
    throw new Error('not used');
  }

  sessionFor(): never {
    throw new Error('not used');
  }

  send(): never {
    throw new Error('not used');
  }

  compact(): never {
    throw new Error('not used');
  }

  drainMessageQueue(): never {
    throw new Error('not used');
  }

  steerMessageQueue(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  cancel(): never {
    throw new Error('not used');
  }

  retry(): never {
    throw new Error('not used');
  }

  truncateThreadFrom(): never {
    throw new Error('not used');
  }

  removeThreadEvent(): never {
    throw new Error('not used');
  }

  stream(): never {
    throw new Error('not used');
  }

  publishEvents(): never {
    throw new Error('not used');
  }

  tickWaitTimers(): never {
    throw new Error('not used');
  }

  countWaitingTimers(): never {
    throw new Error('not used');
  }

  listMcpServers(): never {
    throw new Error('not used');
  }

  invalidateRuntime(): Promise<void> {
    return Promise.resolve();
  }
}

export class RecordingExecutor extends LocalExecutorPort {
  readonly rejected: string[] = [];
  readonly rejectedNotes: Array<string | undefined> = [];
  readonly responded: string[] = [];

  lifecycle(): Promise<never> {
    return Promise.reject(new Error('no runtime'));
  }

  events(): never {
    throw new Error('not used');
  }

  async sessionFor(): Promise<SessionHandle> {
    const rejected = this.rejected;
    const rejectedNotes = this.rejectedNotes;
    const responded = this.responded;
    return {
      send: () => Promise.resolve({ runId: 'run-1' }),
      respond: async (_runId: string, interruptId: string) => {
        responded.push(interruptId);
      },
      reject: async (_runId: string, interruptId: string, opts?: { note?: string }) => {
        rejected.push(interruptId);
        rejectedNotes.push(opts?.note);
      },
      cancel: async () => {},
      subscribe: () => (async function* () {})(),
      runOf: () => Promise.resolve(null),
      activeRun: () => Promise.resolve(null),
    };
  }

  send(): never {
    throw new Error('not used');
  }

  compact(): never {
    throw new Error('not used');
  }

  drainMessageQueue(): never {
    throw new Error('not used');
  }

  steerMessageQueue(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  cancel(): never {
    throw new Error('not used');
  }

  retry(): never {
    throw new Error('not used');
  }

  truncateThreadFrom(): never {
    throw new Error('not used');
  }

  removeThreadEvent(): never {
    throw new Error('not used');
  }

  stream(): never {
    throw new Error('not used');
  }

  publishEvents(): never {
    throw new Error('not used');
  }

  tickWaitTimers(): never {
    throw new Error('not used');
  }

  countWaitingTimers(): never {
    throw new Error('not used');
  }

  listMcpServers(): never {
    throw new Error('not used');
  }

  invalidateRuntime(): Promise<void> {
    return Promise.resolve();
  }
}
