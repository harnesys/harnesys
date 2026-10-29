import type { JsonSchema } from '../domain/json-schema.ts';
import type { ProcessJobTarget } from '../domain/process-job.ts';
import type { ToolAskSubject } from '../domain/tool-subject.ts';
import type { FileAccessPolicy } from './file-access.ts';
export type SideEffect =
  | 'pure'
  | 'read'
  | 'write'
  | 'destructive'
  | 'financial'
  | 'communication'
  | 'credentialed';
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
    exposure: spec.exposure,
    revealsTools: spec.revealsTools,
    gate: spec.gate,
  };
}
