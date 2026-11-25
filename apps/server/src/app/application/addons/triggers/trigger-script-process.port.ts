import type { TriggerScript } from '@harnesys/contracts';

export interface TriggerScriptProcessInput {
  script: TriggerScript;
  cwd: string;
  stdin: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export interface TriggerScriptProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: string;
}

export abstract class TriggerScriptProcessPort {
  abstract run(input: TriggerScriptProcessInput): Promise<TriggerScriptProcessResult>;
}
