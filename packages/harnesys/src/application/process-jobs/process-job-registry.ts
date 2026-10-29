import path from 'node:path';
import type {
  ProcessJobReadResult,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStartInput,
  ProcessJobStatus,
  ProcessJobTarget,
} from '../../domain/process-job.ts';
import { dockerProcessBackend } from './docker-process-backend.ts';
import { hostProcessBackend, type ProcessSpawnBackend } from './process-job-backend.ts';

const SCROLLBACK_CHARS = 256000;
const MAX_RUNNING_PER_CWD = 16;
type DataListener = (chunk: string) => void;
type ExitListener = (code: number | null) => void;
interface LiveJob {
  record: ProcessJobRecord;
  proc: Bun.Subprocess;
  terminal: Bun.Terminal | null;
  scrollback: string;
  totalAppended: number;
  settled: boolean;
  dataListeners: Set<DataListener>;
  exitListeners: Set<ExitListener>;
}
function appendScrollback(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= SCROLLBACK_CHARS) {
    return next;
  }
  return next.slice(next.length - SCROLLBACK_CHARS);
}
function pushChunk(job: LiveJob, chunk: string): void {
  if (chunk.length === 0) {
    return;
  }
  job.scrollback = appendScrollback(job.scrollback, chunk);
  job.totalAppended += chunk.length;
  for (const listener of job.dataListeners) {
    listener(chunk);
  }
}
function settle(job: LiveJob, status: ProcessJobStatus, code: number | null): void {
  if (job.settled) {
    return;
  }
  job.settled = true;
  job.record = { ...job.record, status, exitCode: code };
  for (const listener of job.exitListeners) {
    listener(code);
  }
}
function defaultBackendFor(target?: ProcessJobTarget): ProcessSpawnBackend {
  if (target?.kind === 'container') {
    return dockerProcessBackend;
  }
  return hostProcessBackend;
}
export function createProcessJobRegistry(
  backendFor?: (target?: ProcessJobTarget) => ProcessSpawnBackend,
): ProcessJobRegistry {
  const backendOf = backendFor ?? defaultBackendFor;
  const byId = new Map<string, LiveJob>();
  function runningInCwd(cwd: string): number {
    let count = 0;
    for (const job of byId.values()) {
      if (job.record.cwd === cwd && job.record.status === 'running') {
        count += 1;
      }
    }
    return count;
  }
  function snapshot(record: ProcessJobRecord): ProcessJobRecord {
    return { ...record };
  }
  return {
    start(input: ProcessJobStartInput): ProcessJobRecord {
      const cwd = path.resolve(input.cwd);
      if (runningInCwd(cwd) >= MAX_RUNNING_PER_CWD) {
        throw new Error('too many running process jobs');
      }
      const id = crypto.randomUUID();
      const record: ProcessJobRecord = {
        id,
        cwd,
        mode: input.mode,
        title: input.title ?? (input.command || 'Terminal'),
        command: input.command,
        status: 'running',
        exitCode: null,
        createdAt: new Date().toISOString(),
        ...(input.orgId === undefined ? {} : { orgId: input.orgId }),
        ...(input.process === undefined ? {} : { target: input.process }),
      };
      let job: LiveJob | undefined;
      const proc = backendOf(input.process).start({
        ...input,
        record,
        onData: (chunk) => {
          if (job) {
            pushChunk(job, chunk);
          }
        },
        onExit: (code) => {
          if (job) {
            settle(job, 'exited', code);
          }
        },
      });
      if (input.mode === 'pty' && !proc.terminal) {
        try {
          proc.kill();
        } catch {}
        throw new Error('Bun.spawn did not attach a terminal');
      }
      job = {
        record,
        proc,
        terminal: proc.terminal ?? null,
        scrollback: '',
        totalAppended: 0,
        settled: false,
        dataListeners: new Set(),
        exitListeners: new Set(),
      };
      byId.set(id, job);
      return snapshot(job.record);
    },
    get(id): ProcessJobRecord | null {
      const job = byId.get(id);
      return job ? snapshot(job.record) : null;
    },
    list(filter): ProcessJobRecord[] {
      return [...byId.values()]
        .filter((job) => {
          if (filter?.cwd !== undefined && job.record.cwd !== path.resolve(filter.cwd)) {
            return false;
          }
          if (filter?.orgId !== undefined && job.record.orgId !== filter.orgId) {
            return false;
          }
          if (filter?.mode !== undefined && job.record.mode !== filter.mode) {
            return false;
          }
          return true;
        })
        .map((job) => snapshot(job.record))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    read(id, opts): ProcessJobReadResult | null {
      const job = byId.get(id);
      if (!job) {
        return null;
      }
      const since = Math.max(0, opts?.since ?? 0);
      const dropped = job.totalAppended - job.scrollback.length;
      if (since <= dropped) {
        return { text: job.scrollback, nextSince: job.totalAppended, truncated: since < dropped };
      }
      return {
        text: job.scrollback.slice(since - dropped),
        nextSince: job.totalAppended,
        truncated: false,
      };
    },
    write(id, data): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running') {
        return false;
      }
      try {
        if (job.terminal) {
          if (job.terminal.closed) {
            return false;
          }
          job.terminal.write(data);
          return true;
        }
        const stdin = job.proc.stdin;
        if (stdin === null || stdin === undefined || typeof stdin === 'number') {
          return false;
        }
        stdin.write(data);
        return true;
      } catch {
        return false;
      }
    },
    resize(id, cols, rows): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running' || !job.terminal) {
        return false;
      }
      if (
        !Number.isFinite(cols) ||
        !Number.isFinite(rows) ||
        cols < 2 ||
        rows < 1 ||
        job.terminal.closed
      ) {
        return false;
      }
      job.terminal.resize(Math.floor(cols), Math.floor(rows));
      return true;
    },
    subscribe(id, onData, onExit): (() => void) | null {
      const job = byId.get(id);
      if (!job) {
        return null;
      }
      job.dataListeners.add(onData);
      if (onExit) {
        job.exitListeners.add(onExit);
      }
      return () => {
        job.dataListeners.delete(onData);
        if (onExit) {
          job.exitListeners.delete(onExit);
        }
      };
    },
    kill(id): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running') {
        return false;
      }
      try {
        backendOf(job.record.target).kill(job.record, job.proc);
        if (job.terminal && !job.terminal.closed) {
          job.terminal.close();
        }
      } catch {
        return false;
      }
      settle(job, 'killed', null);
      return true;
    },
    delete(id): boolean {
      const job = byId.get(id);
      if (!job) {
        return false;
      }
      byId.delete(id);
      try {
        if (job.record.status === 'running') {
          backendOf(job.record.target).kill(job.record, job.proc);
        } else if (job.terminal && !job.proc.killed) {
          job.proc.kill();
        }
        if (job.terminal && !job.terminal.closed) {
          job.terminal.close();
        }
      } catch {}
      job.dataListeners.clear();
      job.exitListeners.clear();
      return true;
    },
  };
}
