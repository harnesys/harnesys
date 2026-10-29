import type { HookRun, HookRunStatus } from '@harnesys/contracts';

export interface HookRunInput {
  agentId: string;
  hookId: string;
  event: string;
  handlerType: string;
  status: HookRunStatus;
  durationMs: number;
  summary?: string;
  errorCode?: string;
  effects: unknown[];
  runId?: string;
  threadId?: string;
}

export const HOOK_RUNS_DEFAULT_LIMIT = 20;
export const HOOK_RUNS_MAX_LIMIT = 100;

export function hookRunLimitOf(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return HOOK_RUNS_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(value), HOOK_RUNS_MAX_LIMIT);
}

export abstract class HookRunStorePort {
  abstract record(orgId: string, input: HookRunInput): void;

  abstract list(orgId: string, agentId: string, limit: number): HookRun[];
}
