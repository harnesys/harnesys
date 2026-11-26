import { type HookRunStatus, type TriggerPost, TriggerPostSchema } from '@harnesys/contracts';
import type { ScriptResultFacts } from './trigger-script-policy.ts';

export type TriggerRunStatus = 'completed' | 'failed' | 'cancelled';

export interface PostContext {
  triggerId?: string;
  threadId?: string;
  agentId?: string;
  payload?: unknown;
  firedAt?: string;
}

const TAIL_MAX = 2000;

export function harnessEnv(
  stage: 'pre' | 'post',
  context: PostContext,
  cwd: string,
  runId?: string,
): Record<string, string> {
  return {
    HARNESYS_STAGE: stage,
    HARNESYS_WORKSPACE: cwd,
    ...(context.triggerId === undefined ? {} : { HARNESYS_TRIGGER_ID: context.triggerId }),
    ...(runId === undefined ? {} : { HARNESYS_RUN_ID: runId }),
  };
}

export function stdinDoc(
  stage: 'pre' | 'post',
  context: PostContext,
  cwd: string,
  run?: { id?: string; status: TriggerRunStatus },
): string {
  const doc: Record<string, unknown> = {
    kind: 'trigger-script',
    stage,
    workspace: cwd,
    triggerId: context.triggerId,
    threadId: context.threadId,
    agentId: context.agentId,
    firedAt: context.firedAt,
    ...(context.payload === undefined ? {} : { payload: context.payload }),
    ...(run === undefined ? {} : { run }),
  };
  try {
    return JSON.stringify(doc);
  } catch {
    return JSON.stringify({ ...doc, payload: null });
  }
}

export function summaryOf(
  stage: 'pre' | 'post',
  status: HookRunStatus,
  result: ScriptResultFacts,
  detail?: string,
): string {
  if (result.spawnError !== undefined) {
    return `${stage} failed to start: ${result.spawnError}`;
  }
  if (result.timedOut) {
    return `${stage} timed out`;
  }
  if (detail !== undefined) {
    return `${stage} ${status}: ${detail}`;
  }
  if (status === 'ok') {
    return `${stage} passed`;
  }
  const exit = result.exitCode === null ? 'signal' : String(result.exitCode);
  return `${stage} ${status} (exit ${exit})`;
}

export function tailOf(value: string): string {
  return value.length <= TAIL_MAX ? value : value.slice(value.length - TAIL_MAX);
}

export function parsePost(json: string): TriggerPost | undefined {
  try {
    const parsed = TriggerPostSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseContext(json: string): PostContext {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PostContext)
      : {};
  } catch {
    return {};
  }
}
