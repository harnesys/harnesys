import { matchesUntil } from '../../application/process-jobs/read-until.ts';
import type {
  ProcessJobReadResult,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';

const POLL_SLICE_MS = 250;
export interface TerminalSessionReadState {
  read: ProcessJobReadResult;
  status: ProcessJobStatus;
  exitCode: number | null;
  matched?: boolean;
}
function waitForData(jobs: ProcessJobRegistry, id: string, waitMs: number): Promise<void> {
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
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => finish(),
      () => finish(),
    );
    if (unsub === null) {
      finish();
    }
  });
}
export async function readSessionOutput(
  registry: ProcessJobRegistry,
  record: ProcessJobRecord,
  since: number,
  untilRe: RegExp | null,
  timeoutMs: number,
): Promise<TerminalSessionReadState | null> {
  let read = registry.read(record.id, { since });
  if (read === null) {
    return null;
  }
  let status = record.status;
  let exitCode: number | null = record.exitCode;
  let matched = untilRe === null ? undefined : matchesUntil(untilRe, read.text);
  const deadline = Date.now() + timeoutMs;
  while (untilRe !== null && matched !== true && status === 'running' && Date.now() < deadline) {
    await waitForData(registry, record.id, POLL_SLICE_MS);
    const reread = registry.read(record.id, { since });
    if (reread === null) {
      break;
    }
    read = reread;
    const current = registry.get(record.id);
    if (current === null) {
      break;
    }
    status = current.status;
    exitCode = current.exitCode;
    matched = matchesUntil(untilRe, read.text);
  }
  const final = registry.get(record.id);
  return {
    read,
    status: final?.status ?? status,
    exitCode: final?.exitCode ?? exitCode,
    ...(matched === undefined ? {} : { matched }),
  };
}
