import type { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import type {
  TriggerScriptPendingPost,
  TriggerScriptRunInput,
  TriggerScriptRunRow,
} from '../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { type ResolveRunCwdInput, RunCwdResolverPort } from '../../domain/thread/run-cwd.port.ts';
import { NullLogger } from './addons.fakes.ts';
import {
  type RegisterPostScriptInput,
  type RunPreScriptInput,
  RunTriggerScriptsUseCase,
} from './triggers/run-trigger-scripts.use-case.ts';
import type {
  TriggerScriptProcessInput,
  TriggerScriptProcessResult,
} from './triggers/trigger-script-process.port.ts';
import { TriggerScriptProcessPort } from './triggers/trigger-script-process.port.ts';

export class FakeScriptProcess extends TriggerScriptProcessPort {
  calls: TriggerScriptProcessInput[] = [];
  results: TriggerScriptProcessResult[] = [];

  async run(input: TriggerScriptProcessInput): Promise<TriggerScriptProcessResult> {
    this.calls.push(input);
    return (
      this.results.shift() ?? {
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 1,
        timedOut: false,
        aborted: false,
      }
    );
  }
}

export class FakeRunCwd extends RunCwdResolverPort {
  cwd: string | null = '/workspace';

  override resolve(_input: ResolveRunCwdInput): string | null {
    return this.cwd;
  }
}

export class FakeScriptRuns extends TriggerScriptRunRepositoryPort {
  recorded: TriggerScriptRunInput[] = [];
  pending = new Map<string, TriggerScriptPendingPost>();

  record(input: TriggerScriptRunInput): void {
    this.recorded.push(input);
  }

  list(_orgId: string, _instanceId: string, _limit: number): TriggerScriptRunRow[] {
    return [];
  }

  savePending(input: TriggerScriptPendingPost): void {
    this.pending.set(input.runId, input);
  }

  takePending(_orgId: string, runId: string): TriggerScriptPendingPost | null {
    const pending = this.pending.get(runId) ?? null;
    this.pending.delete(runId);
    return pending;
  }

  removePendingForInstance(_orgId: string, instanceId: string): void {
    for (const [runId, pending] of this.pending) {
      if (pending.instanceId === instanceId) {
        this.pending.delete(runId);
      }
    }
  }
}

export interface TriggerScriptsHarness {
  useCase: RunTriggerScriptsUseCase;
  process: FakeScriptProcess;
  cwd: FakeRunCwd;
  runs: FakeScriptRuns;
}

export function buildTriggerScripts(
  triggers: TriggerInstanceRepositoryPort,
): TriggerScriptsHarness {
  const process = new FakeScriptProcess();
  const cwd = new FakeRunCwd();
  const runs = new FakeScriptRuns();
  return {
    useCase: new RunTriggerScriptsUseCase(process, cwd, runs, triggers, new NullLogger()),
    process,
    cwd,
    runs,
  };
}

export type { RegisterPostScriptInput, RunPreScriptInput };
