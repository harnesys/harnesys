import { SANDBOX_DENY_PREFIX } from '../constants.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { ToolAskSubject } from '../domain/tool-subject.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import { emitHook, hookBlockedReason } from './hooks/emit-hook.ts';
import {
  loadCheckpoint,
  loadRunOpGrant,
  recordDenied,
  recordGranted,
  recordRunOpGrant,
} from './tool-approve-checkpoint.ts';
import type { ToolCallResult } from './tool-call.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';

export { SANDBOX_DENY_PREFIX };
export interface PermissionGateCall {
  name: string;
  args: unknown;
  id: string;
}
export interface PermissionGateContext {
  nodeExecutionId: string;
  resumePayload?: unknown;
  resumeInterruptId?: string;
  resumeNote?: string;
  resumeRejected?: boolean;
  state: Record<string, unknown>;
  nodeId: string;
  sandbox?: boolean;
  hooks?: HookEmitCtx;
  agentId?: string;
  spawnPath?: string;
}
export interface PermissionGateDone {
  result: ToolCallResult;
  message: ToolMessage;
}
export const PERMISSION_RESUME_SCHEMA = {
  type: 'object',
  properties: { approved: { type: 'boolean' } },
  required: ['approved'],
} as JsonSchema;
export const PERMISSION_RESUME_SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    scope: { type: 'string', enum: ['once', 'run', 'always'] },
  },
  required: ['approved'],
} as JsonSchema;
export type PermissionResumeScope = 'once' | 'run' | 'always';
export function permissionResumeMatches(ctx: PermissionGateContext, idx: number): boolean {
  return ctx.resumeInterruptId === `perm/${ctx.nodeExecutionId}/${idx}`;
}
export function isPermissionResumeId(ctx: PermissionGateContext): boolean {
  return typeof ctx.resumeInterruptId === 'string' && ctx.resumeInterruptId.startsWith('perm/');
}
export function resumeApproved(ctx: PermissionGateContext): boolean | null {
  const payload = ctx.resumePayload;
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const approved = (
    payload as {
      approved?: unknown;
    }
  ).approved;
  return typeof approved === 'boolean' ? approved : null;
}
export function resumeScope(ctx: PermissionGateContext): PermissionResumeScope | undefined {
  const payload = ctx.resumePayload;
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  const scope = (
    payload as {
      scope?: unknown;
    }
  ).scope;
  return scope === 'once' || scope === 'run' || scope === 'always' ? scope : undefined;
}
export type SandboxDenyKind = 'permission' | 'approval' | 'user input';
export function sandboxDenyText(tool: string, what: SandboxDenyKind): string {
  return `${SANDBOX_DENY_PREFIX}${tool} requires ${what}, no interactive user here; parent must provide, pre-approve, or do it itself`;
}
export function sandboxSharedStateDenyText(tool: string): string {
  return `${SANDBOX_DENY_PREFIX}${tool} writes state shared with the parent thread or project; the parent must do it itself`;
}
export function throwPermissionAsk(
  call: PermissionGateCall,
  ctx: PermissionGateContext,
  idx: number,
  operation: string | undefined,
  subject?: ToolAskSubject,
): never {
  const delegated = ctx.sandbox ? { agentId: ctx.agentId, spawnPath: ctx.spawnPath } : undefined;
  throw new AskUserInterrupt({
    prompt: `allow ${operation}?`,
    source: 'permission',
    tool: { name: call.name, input: call.args, toolCallId: call.id, subject },
    delegated,
    interruptId: `perm/${ctx.nodeExecutionId}/${idx}`,
    resumeSchema: delegated ? PERMISSION_RESUME_SCOPE_SCHEMA : PERMISSION_RESUME_SCHEMA,
  });
}
function payloadReasonOf(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  const rec = payload as {
    reason?: unknown;
    note?: unknown;
  };
  for (const candidate of [rec.reason, rec.note]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  return undefined;
}
export function skippedGateResult(
  call: PermissionGateCall,
  ctx: PermissionGateContext,
): PermissionGateDone {
  const base = isPermissionResumeId(ctx) ? 'denied by user' : 'rejected by user';
  const note =
    typeof ctx.resumeNote === 'string' && ctx.resumeNote !== ''
      ? ctx.resumeNote
      : payloadReasonOf(ctx.resumePayload);
  const content = note !== undefined ? `${base}: ${note}` : base;
  return {
    result: { id: call.id, name: call.name, result: content, isError: false, skipped: true },
    message: buildToolMessage({ toolCallId: call.id, name: call.name, content }),
  };
}
export async function applyPermissionGate(input: {
  call: PermissionGateCall;
  ctx: PermissionGateContext;
  idx: number;
  operation: string | undefined;
  subject?: ToolAskSubject;
}): Promise<PermissionGateDone | null> {
  const { call, ctx, idx, operation } = input;
  if (loadCheckpoint(ctx.state, ctx.nodeId)?.granted?.[call.id]) {
    return null;
  }
  if (operation && loadRunOpGrant(ctx.state, operation)) {
    return null;
  }
  if (ctx.sandbox) {
    throwPermissionAsk(call, ctx, idx, operation, input.subject);
  }
  const approved = resumeApproved(ctx);
  const resumeMatches = permissionResumeMatches(ctx, idx);
  if (resumeMatches && ctx.resumeRejected === true) {
    ctx.resumePayload = undefined;
    return skippedGateResult(call, ctx);
  }
  if (!resumeMatches || approved === null) {
    const request = await emitHook(ctx.hooks, 'PermissionRequest', {
      tool_name: call.name,
      tool_input: call.args,
      tool_use_id: call.id,
    });
    const blocked = hookBlockedReason(request);
    if (blocked !== undefined) {
      recordDenied(ctx.state, call.id, { tool: call.name, reason: blocked });
      return {
        result: { id: call.id, name: call.name, result: blocked, isError: true },
        message: buildToolMessage({ toolCallId: call.id, name: call.name, content: blocked }),
      };
    }
    throwPermissionAsk(call, ctx, idx, operation, input.subject);
  }
  if (approved === false) {
    const skipped = skippedGateResult(call, ctx);
    ctx.resumePayload = undefined;
    return skipped;
  }
  const scope = resumeScope(ctx);
  recordGranted(ctx.state, ctx.nodeId, call.id);
  if (operation && scope !== 'once') {
    recordRunOpGrant(ctx.state, operation);
  }
  ctx.resumePayload = undefined;
  return null;
}
