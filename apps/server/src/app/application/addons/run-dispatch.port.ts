import type { RunDispatchOutcome } from '../../domain/addons/run-dispatch.ts';

export type { RunDispatchOutcome };

export interface RunDispatchInput {
  orgId: string;
  threadId: string;
  agentId: string;
  text: string;
  runKey?: string;
  correlationId?: string;
  signal?: AbortSignal;
}

export abstract class RunDispatchPort {
  abstract dispatch(input: RunDispatchInput): Promise<RunDispatchOutcome>;
}
