import type { JsonSchema } from '../domain/json-schema.ts';
import type { ProcessJobTarget } from '../domain/process-job.ts';
import type { ToolAskSubject } from '../domain/tool-subject.ts';
import type { FileAccessPolicy } from './file-access.ts';
export const SIDE_EFFECTS = [
  'pure',
  'read',
  'write',
  'destructive',
  'financial',
  'communication',
  'credentialed',
] as const;
export type SideEffect = (typeof SIDE_EFFECTS)[number];
export function isSideEffect(value: unknown): value is SideEffect {
  return (SIDE_EFFECTS as readonly unknown[]).includes(value);
}
export const MUTATING_SIDE_EFFECTS: readonly SideEffect[] = [
  'write',
  'destructive',
  'financial',
  'communication',
];
export interface SpawnEffectEntry {
  tool: string;
  ok: boolean;
  note?: string;
}
export interface SpawnEffectsJournal {
  entries: SpawnEffectEntry[];
  omitted: number;
}
export interface SpawnToolUse {
  total: number;
  used: string[];
  unused: string[];
}
export interface BackgroundToolStatus {
  runId: string;
  threadId: string;
  spawnId: string;
  agentId: string;
  agentName?: string;
  status: 'running' | 'done' | 'failed';
  output?: unknown;
  error?: { code: string; message: string };
  effects?: SpawnEffectsJournal;
  caps?: string[];
  toolUse?: SpawnToolUse;
  tail?: string;
  idleMs?: number;
}
export interface RunToolControl {
  waitBackground(threadId: string, timeoutMs?: number): Promise<BackgroundToolStatus[]>;
  status(threadId: string, spawnId?: string): Promise<BackgroundToolStatus[]>;
  send(
    threadId: string,
    spawnId: string,
    text: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  stop(threadId: string, spawnId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}
export interface ToolContext {
  cwd: string;
  paths: {
    allow: string[];
    write?: string[];
    threadDir?: string;
  };
  signal?: AbortSignal;
  resume?: unknown;
  sandbox?: boolean;
  env?: Record<string, string>;
  agentId?: string;
  threadId?: string;
  runId?: string;
  runControl?: RunToolControl;
  process?: ProcessJobTarget;
  fileAccess?: FileAccessPolicy;
}
export type ToolExecute = (input: unknown, ctx: ToolContext) => Promise<unknown> | unknown;
export type ToolCallGate =
  | {
      decision: 'allow';
    }
  | {
      decision: 'ask';
      subject?: ToolAskSubject;
    }
  | {
      decision: 'deny';
      reason: string;
    };
export interface ToolGateContext {
  cwd: string;
  paths?: { threadDir?: string };
  fileAccess?: FileAccessPolicy;
}
export type ToolExposure = 'direct' | 'deferred';
export type ToolGate = (input: unknown, ctx: ToolGateContext) => ToolCallGate | undefined;
export interface ToolDefinition {
  name: string;
  description: string;
  group?: string;
  operations?: string[];
  input: JsonSchema;
  execute: ToolExecute;
  sideEffect?: SideEffect;
  interactive?: boolean;
  exposure?: ToolExposure;
  revealsTools?: boolean;
  gate?: ToolGate;
}
export interface ToolCatalogEntry {
  name: string;
  description: string;
  group?: string;
}
export interface CustomNodeImpl {
  execute(ctx: unknown): Promise<unknown> | unknown;
}
export function tool(
  name: string,
  spec: {
    description: string;
    group?: string;
    operations?: string[];
    input: JsonSchema;
    execute: ToolExecute;
    sideEffect?: SideEffect;
    interactive?: boolean;
    exposure?: ToolExposure;
    revealsTools?: boolean;
    gate?: ToolGate;
  },
): ToolDefinition {
  if (!name || typeof name !== 'string') {
    throw new Error('tool name required');
  }
  if (!spec.description) {
    throw new Error('tool description required');
  }
  return {
    name,
    description: spec.description,
    group: spec.group,
    operations: spec.operations,
    input: spec.input,
    execute: spec.execute,
    sideEffect: spec.sideEffect,
    interactive: spec.interactive,
    exposure: spec.exposure,
    revealsTools: spec.revealsTools,
    gate: spec.gate,
  };
}
