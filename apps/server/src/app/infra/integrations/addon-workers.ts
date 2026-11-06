import type {
  AddonDatabase,
  AddonLogger,
  AddonWorkerHandle,
  AddonWorkerRegistry,
} from 'harnesys/integration';
import { tryAcquireLease } from '../../domain/connector/lease.ts';

const LEASE_TTL_MS = 15_000;
const LEASE_RENEW_MS = 5_000;
const IDLE_SLEEP_MS = 5_000;
const BACKOFF_MS = 30_000;

export interface AddonWorkersDeps {
  db: AddonDatabase;
  machineId: string;
  canRun: () => boolean;
  logger: AddonLogger;
}

interface WorkerState {
  id: string;
  run: (handle: AddonWorkerHandle) => Promise<void>;
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  running: Promise<void>;
}

interface LeaseRow {
  owner: string | null;
  until: string | null;
}

export class AddonWorkersRunner implements AddonWorkerRegistry {
  private readonly states = new Map<string, WorkerState>();
  private stopped = false;

  constructor(private readonly deps: AddonWorkersDeps) {
    deps.db.exec(
      'CREATE TABLE IF NOT EXISTS addon_leases (' +
        'name TEXT PRIMARY KEY, owner TEXT, until TEXT, epoch INTEGER NOT NULL DEFAULT 0);',
    );
  }

  register(id: string, run: (handle: AddonWorkerHandle) => Promise<void>): void {
    if (this.stopped || this.states.has(id)) {
      return;
    }
    const state: WorkerState = {
      id,
      run,
      abort: new AbortController(),
      renewTimer: null,
      running: Promise.resolve(),
    };
    state.running = this.loop(state);
    this.states.set(id, state);
  }

  async stop(id: string): Promise<void> {
    const state = this.states.get(id);
    if (!state) {
      return;
    }
    this.states.delete(id);
    await this.shutdown(state);
  }

  async stopAll(): Promise<void> {
    this.stopped = true;
    const states = [...this.states.values()];
    this.states.clear();
    for (const state of states) {
      await this.shutdown(state);
    }
  }

  private async shutdown(state: WorkerState): Promise<void> {
    this.stopRenew(state);
    state.abort.abort();
    try {
      await state.running;
    } catch {
      // loop handles its own errors
    }
  }

  private async loop(state: WorkerState): Promise<void> {
    const me = this.deps.machineId;
    try {
      while (!state.abort.signal.aborted && !this.stopped) {
        if (!this.deps.canRun()) {
          await sleep(IDLE_SLEEP_MS, state.abort.signal);
          continue;
        }
        const lease = this.readLease(state.id);
        const decision = tryAcquireLease({
          owner: lease?.owner ?? null,
          until: lease?.until ?? null,
          me,
          now: Date.now(),
        });
        if (decision === 'busy') {
          await sleep(IDLE_SLEEP_MS, state.abort.signal);
          continue;
        }
        const outcome = await this.runOnce(state, me);
        if (outcome === 'done') {
          break;
        }
      }
    } finally {
      this.clearLeaseIfMine(state.id);
      this.states.delete(state.id);
    }
  }

  private async runOnce(state: WorkerState, me: string): Promise<'retry' | 'done'> {
    const signal = state.abort.signal;
    this.writeLease(state.id);
    this.startRenew(state);
    let failed = false;
    try {
      await state.run({ id: state.id, machineId: me, signal });
    } catch (error) {
      failed = true;
      this.deps.logger.error(`addon worker ${state.id} failed: ${errorText(error)}`);
      await sleep(BACKOFF_MS, signal);
    } finally {
      this.stopRenew(state);
    }
    if (signal.aborted || this.stopped) {
      return 'done';
    }
    return failed ? 'retry' : 'done';
  }

  private readLease(id: string): LeaseRow | undefined {
    return this.deps.db.get<LeaseRow>('SELECT owner, until FROM addon_leases WHERE name = ?', [id]);
  }

  private writeLease(id: string): void {
    const until = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    this.deps.db.run(
      'INSERT INTO addon_leases (name, owner, until, epoch) VALUES (?, ?, ?, 1) ' +
        'ON CONFLICT (name) DO UPDATE SET owner = excluded.owner, until = excluded.until, ' +
        'epoch = addon_leases.epoch + 1',
      [id, this.deps.machineId, until],
    );
  }

  private clearLeaseIfMine(id: string): void {
    this.deps.db.run('DELETE FROM addon_leases WHERE name = ? AND owner = ?', [
      id,
      this.deps.machineId,
    ]);
  }

  private startRenew(state: WorkerState): void {
    if (state.renewTimer) {
      return;
    }
    state.renewTimer = setInterval(() => {
      if (!this.deps.canRun()) {
        return;
      }
      this.writeLease(state.id);
    }, LEASE_RENEW_MS);
  }

  private stopRenew(state: WorkerState): void {
    if (!state.renewTimer) {
      return;
    }
    clearInterval(state.renewTimer);
    state.renewTimer = null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
