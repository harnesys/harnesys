import type { RunDispatchOutcome } from '../../domain/addons/run-dispatch.ts';

export type { RunDispatchOutcome };

export interface RunDispatchInput {
  orgId: string;
  threadId: string;
  agentId: string;
  text: string;
  attachmentIds?: string[];
  mode?: string;
  runKey?: string;
  correlationId?: string;
  payload?: unknown;
  actorUserId?: string | null;
  signal?: AbortSignal;
}

export interface RunDispatchResult {
  outcome: RunDispatchOutcome;
  /** Host-side run id of the accepted run; null when nothing was started. */
  runId: string | null;
}

export abstract class RunDispatchPort {
  abstract dispatch(input: RunDispatchInput): Promise<RunDispatchResult>;
}
