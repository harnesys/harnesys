import type {
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';

export const JOB_STARTUP_PROBE_MS = 1800;
export const OUTPUT_TAIL_CHARS = 600;

export function waitForJobExit(
  jobs: ProcessJobRegistry,
  id: string,
  waitMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub?.();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      finish();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => undefined,
      () => {
        finish();
      },
    );
    if (unsub === null) {
      finish();
      return;
    }
    if (signal?.aborted === true) {
      finish();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function outputTail(text: string, limit: number = OUTPUT_TAIL_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : trimmed.slice(-limit);
}

export interface JobStartupOutcome {
  status: ProcessJobStatus;
  exitCode: number | null;
  tail: string;
}

export async function probeJobStartup(
  jobs: ProcessJobRegistry,
  record: ProcessJobRecord,
  waitMs: number = JOB_STARTUP_PROBE_MS,
  signal?: AbortSignal,
): Promise<JobStartupOutcome | null> {
  await waitForJobExit(jobs, record.id, waitMs, signal);
  const final = jobs.get(record.id);
  if (final === null || final.status === 'running') {
    return null;
  }
  return {
    status: final.status,
    exitCode: final.exitCode,
    tail: outputTail(jobs.read(record.id)?.text ?? ''),
  };
}
