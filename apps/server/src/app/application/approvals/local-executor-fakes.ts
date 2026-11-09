import type { RunLifecycleStore, RunRecord, SessionEvent, SessionHandle } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

const RUN_RECORD: RunRecord = {
  runId: 'run-1',
  threadId: 'thread-1',
  agentId: 'agent-1',
  status: 'needs_input',
  attempt: 1,
  leaseEpoch: 1,
  lastSeq: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

class StubLifecycle implements RunLifecycleStore {
  async get(runId: string): Promise<RunRecord | null> {
    return runId === RUN_RECORD.runId ? RUN_RECORD : null;
  }
  create(): Promise<RunRecord> {
    return Promise.resolve(RUN_RECORD);
  }
  activeByThread(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
  childrenByParent(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  claim(): Promise<RunRecord | null> {
    return Promise.resolve(null);
  }
  transition(): Promise<RunRecord> {
    return Promise.resolve(RUN_RECORD);
  }
  renewLease(): Promise<boolean> {
    return Promise.resolve(false);
  }
  listClaimable(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  listDueTimers(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
  listStaleRunning(): Promise<RunRecord[]> {
    return Promise.resolve([]);
  }
}

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

  cancelCompact(): Promise<boolean> {
    return Promise.resolve(false);
  }

  undoThreadCompact(): Promise<SessionEvent> {
    return Promise.reject(new Error('not used'));
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

  lifecycle(): Promise<RunLifecycleStore> {
    return Promise.resolve(new StubLifecycle());
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

  cancelCompact(): Promise<boolean> {
    return Promise.resolve(false);
  }

  undoThreadCompact(): Promise<SessionEvent> {
    return Promise.reject(new Error('not used'));
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
