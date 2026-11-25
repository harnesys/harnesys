import type { HookRunStatus, TriggerGateVerdict, TriggerScriptStage } from '@harnesys/contracts';

export interface TriggerScriptRunRow {
  id: string;
  orgId: string;
  instanceId: string;
  addonId: string;
  stage: TriggerScriptStage;
  runId: string | null;
  status: HookRunStatus;
  exitCode: number | null;
  durationMs: number;
  cwd: string;
  gateVerdict: TriggerGateVerdict | null;
  summary: string | null;
  stdout: string;
  stderr: string;
  createdAt: string;
}

export interface TriggerScriptRunInput {
  orgId: string;
  instanceId: string;
  addonId: string;
  stage: TriggerScriptStage;
  runId: string | null;
  status: HookRunStatus;
  exitCode: number | null;
  durationMs: number;
  cwd: string;
  gateVerdict: TriggerGateVerdict | null;
  summary: string | null;
  stdout: string;
  stderr: string;
  createdAt: string;
}

export interface TriggerScriptPendingPost {
  orgId: string;
  instanceId: string;
  addonId: string;
  runId: string;
  cwd: string;
  postJson: string;
  contextJson: string;
  createdAt: string;
}

export abstract class TriggerScriptRunRepositoryPort {
  abstract record(input: TriggerScriptRunInput): void;

  abstract list(orgId: string, instanceId: string, limit: number): TriggerScriptRunRow[];

  abstract savePending(input: TriggerScriptPendingPost): void;

  abstract takePending(orgId: string, runId: string): TriggerScriptPendingPost | null;

  abstract removePendingForInstance(orgId: string, instanceId: string): void;
}
