import { SANDBOX_DENIED_STATE_TOOLS } from '../constants.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import { presentCallOutput, serializeToolOutput } from './clip-tool-output.ts';
import { unsupportedControlIntentText } from './graph-agent-controls.ts';
import {
  emitHook,
  hookAskReason,
  hookBlockedReason,
  hookUpdateInputOf,
  hookUpdateOutputOf,
} from './hooks/emit-hook.ts';
import { checkPermission } from './permissions.ts';
import { redactSecrets } from './redact-secrets.ts';
import {
  clearCheckpoint,
  loadCheckpoint,
  recordCompleted,
  recordDenied,
  recordGranted,
  validCheckpointEntries,
} from './tool-approve-checkpoint.ts';
import { ensureAskInterruptId, isAskResumeForCall } from './tool-ask.ts';
import type { ToolCallContext, ToolCallResult } from './tool-call.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';
import {
  applyPermissionGate,
  PERMISSION_RESUME_SCHEMA,
  permissionResumeMatches,
  resumeApproved,
  sandboxDenyText,
  sandboxSharedStateDenyText,
  skippedGateResult,
} from './tool-permission.ts';
import { runBatchWorkerPool } from './tool-pool.ts';
import { validateToolInput } from './tool-registry.ts';
export interface ToolCallBatchOutcome {
  results: ToolCallResult[];
  toolMessages: (ToolMessage | undefined)[];
}
export interface ApproveNodeLike {
  approve?: {
    tools: string[];
    reason: string;
    resumeSchema: JsonSchema;
  };
  concurrency?: 'parallel' | 'sequential';
}
export interface PreparedToolCall {
  name: string;
  args: unknown;
  id: string;
}
export interface ApproveResumePayload {
  approved?: boolean;
}
export interface SingleToolCallDone {
  result: ToolCallResult;
  message: ToolMessage;
}
function codeError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

const HOOK_ASK_PREFIX = 'perm/';

async function applyHookAsk(
  call: PreparedToolCall,
  ctx: ToolCallContext,
  idx: number,
  reason: string,
): Promise<SingleToolCallDone | null> {
  if (loadCheckpoint(ctx.state, ctx.nodeId)?.granted?.[call.id]) {
    return null;
  }
  if (ctx.sandbox) {
    const content = sandboxDenyText(call.name, 'approval');
    recordDenied(ctx.state, call.id, { tool: call.name, reason: content });
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: buildToolMessage({ toolCallId: call.id, name: call.name, content }),
    };
  }
  const approved = resumeApproved(ctx);
  const resumeMatches = permissionResumeMatches(ctx, idx);
  if (resumeMatches && ctx.resumeRejected === true) {
    ctx.resumePayload = undefined;
    const skipped = skippedGateResult(call, ctx);
    return { result: skipped.result, message: skipped.message };
  }
  if (!resumeMatches || approved === null) {
    throw new AskUserInterrupt({
      prompt: reason,
      source: 'permission',
      tool: { name: call.name, input: call.args, toolCallId: call.id },
      interruptId: `${HOOK_ASK_PREFIX}${ctx.nodeExecutionId}/${idx}`,
      resumeSchema: PERMISSION_RESUME_SCHEMA,
    });
  }
  if (approved === false) {
    const skipped = skippedGateResult(call, ctx);
    ctx.resumePayload = undefined;
    return { result: skipped.result, message: skipped.message };
  }
  recordGranted(ctx.state, ctx.nodeId, call.id);
  ctx.resumePayload = undefined;
  return null;
}
export async function runSingleToolCall(
  call: PreparedToolCall,
  ctx: ToolCallContext,
  idx: number,
): Promise<SingleToolCallDone> {
  const message = (content: string): ToolMessage =>
    buildToolMessage({ toolCallId: call.id, name: call.name, content });
  if (ctx.sandbox && SANDBOX_DENIED_STATE_TOOLS.includes(call.name)) {
    const content = sandboxSharedStateDenyText(call.name);
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: message(content),
    };
  }
  const def = ctx.toolRegistry.get(call.name);
  if (!def) {
    const content = `tool not found ${call.name}`;
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: message(content),
    };
  }
  const validation = validateToolInput(def.input, call.args);
  if (!validation.ok) {
    return {
      result: { id: call.id, name: call.name, result: validation.errors, isError: true },
      message: message(await presentCallOutput(ctx, call, validation.errors)),
    };
  }
  const callGate = def.gate?.(call.args, {
    cwd: ctx.paths?.cwd ?? '',
    paths: { threadDir: ctx.paths?.threadDir },
    fileAccess: ctx.fileAccess,
  });
  if (callGate?.decision === 'deny') {
    const content = callGate.reason;
    recordDenied(ctx.state, call.id, { tool: call.name, reason: content });
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: message(content),
    };
  }
  const gateAllowedByRule = callGate?.decision === 'allow';
  if (def.operations && ctx.permissions) {
    const permCheck = checkPermission(ctx.permissions, def.operations);
    const bypassAsk = gateAllowedByRule && permCheck.gate === 'ask';
    if (!bypassAsk && !permCheck.allowed) {
      if (permCheck.gate === 'deny') {
        const content = `permission denied: ${permCheck.operation}`;
        await emitHook(ctx.hooks, 'PermissionDenied', {
          tool_name: call.name,
          tool_input: call.args,
          tool_use_id: call.id,
          reason: content,
        });
        return {
          result: { id: call.id, name: call.name, result: content, isError: true },
          message: message(content),
        };
      }
      if (permCheck.gate === 'ask') {
        const parked = await applyPermissionGate({
          call,
          ctx,
          idx,
          operation: permCheck.operation,
        });
        if (parked) {
          return parked;
        }
      }
    }
  }
  if (callGate?.decision === 'ask') {
    const parked = await applyPermissionGate({
      call,
      ctx,
      idx,
      operation: def.operations?.[0],
      subject: callGate.subject,
    });
    if (parked) {
      return parked;
    }
  }
  if (ctx.signal.aborted) {
    return {
      result: {
        id: call.id,
        name: call.name,
        result: 'cancelled',
        isError: false,
        cancelled: true,
      },
      message: message('cancelled'),
    };
  }
  let execArgs: unknown = call.args;
  try {
    if (!ctx.paths?.cwd) {
      throw new Error('paths.cwd is required');
    }
    const pre = await emitHook(ctx.hooks, 'PreToolUse', {
      tool_name: call.name,
      tool_input: call.args,
      tool_use_id: call.id,
    });
    const preBlocked = hookBlockedReason(pre);
    if (preBlocked !== undefined) {
      return {
        result: { id: call.id, name: call.name, result: preBlocked, isError: true },
        message: message(preBlocked),
      };
    }
    const askReason = hookAskReason(pre);
    if (askReason !== undefined) {
      const parked = await applyHookAsk(call, ctx, idx, askReason);
      if (parked) {
        return parked;
      }
    }
    execArgs = hookUpdateInputOf(pre) ?? call.args;
    const toolCtx = {
      cwd: ctx.paths.cwd,
      paths: {
        allow: ctx.paths?.allow ?? [],
        write: ctx.paths?.write ?? [],
        threadDir: ctx.paths?.threadDir,
      },
      signal: ctx.signal,
      resume: isAskResumeForCall(ctx.resumeInterruptId, call.id)
        ? (ctx.resume ?? undefined)
        : undefined,
      sandbox: ctx.sandbox,
      env: ctx.env,
      agentId: ctx.agentId,
      process: ctx.process,
      fileAccess: ctx.fileAccess,
    };
    const value = await def.execute(execArgs, toolCtx);
    const post = await emitHook(ctx.hooks, 'PostToolUse', {
      tool_name: call.name,
      tool_input: execArgs,
      tool_use_id: call.id,
      tool_output: value,
    });
    const out = hookUpdateOutputOf(post) ?? value;
    if (ctx.sandbox && call.name === 'ask_user') {
      const reason = typeof out === 'string' ? out : serializeToolOutput(out);
      recordDenied(ctx.state, call.id, { tool: call.name, reason });
      return {
        result: { id: call.id, name: call.name, result: reason, isError: true },
        message: message(reason),
      };
    }
    if (def.revealsTools) {
      const loaded = (
        value as {
          loaded?: unknown;
        } | null
      )?.loaded;
      if (Array.isArray(loaded)) {
        const names = loaded.filter((n): n is string => typeof n === 'string');
        const prev = Array.isArray(ctx.state.loadedTools)
          ? (ctx.state.loadedTools as string[])
          : [];
        ctx.state.loadedTools = [
          ...new Set([...prev, ...names.filter((n) => ctx.toolRegistry.has(n))]),
        ];
      }
    }
    const notQueued = unsupportedControlIntentText(call.name, ctx.planNodeTypes);
    if (notQueued !== null) {
      return {
        result: { id: call.id, name: call.name, result: notQueued, isError: true },
        message: message(notQueued),
      };
    }
    return {
      result: { id: call.id, name: call.name, result: out, isError: false },
      message: message(await presentCallOutput(ctx, call, out)),
    };
  } catch (e) {
    if (
      (
        e as {
          name?: string;
        }
      ).name === 'AbortError' ||
      ctx.signal.aborted
    ) {
      return {
        result: {
          id: call.id,
          name: call.name,
          result: 'cancelled',
          isError: false,
          cancelled: true,
        },
        message: message('cancelled'),
      };
    }
    if (e instanceof AskUserInterrupt) {
      if (ctx.sandbox) {
        const reason = sandboxDenyText(call.name, 'user input');
        recordDenied(ctx.state, call.id, { tool: call.name, reason });
        return {
          result: { id: call.id, name: call.name, result: reason, isError: true },
          message: message(reason),
        };
      }
      ensureAskInterruptId(e, call.id);
      throw e;
    }
    const content = e instanceof Error ? e.message : String(e);
    const post = await emitHook(ctx.hooks, 'PostToolUseFailure', {
      tool_name: call.name,
      tool_input: execArgs,
      tool_use_id: call.id,
      failure_reason: content,
    });
    const substituted = hookUpdateOutputOf(post);
    const rawText = substituted !== undefined ? serializeToolOutput(substituted) : content;
    const finalText = ctx.toolOutput?.redactSecrets === true ? redactSecrets(rawText) : rawText;
    return {
      result: {
        id: call.id,
        name: call.name,
        result: finalText,
        isError: true,
      },
      message: message(finalText),
    };
  }
}
export async function executeApproveBatch(
  node: ApproveNodeLike,
  calls: PreparedToolCall[],
  ctx: ToolCallContext,
): Promise<ToolCallBatchOutcome> {
  const approve = node.approve;
  if (!approve) {
    codeError('approve_missing', 'executeApproveBatch requires node.approve');
  }
  const approveTools = new Set(approve.tools);
  const needsApproveIdx: number[] = [];
  const freeIdx: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (!call) {
      continue;
    }
    if (approveTools.has(call.name)) {
      needsApproveIdx.push(i);
    } else {
      freeIdx.push(i);
    }
  }
  const results: (ToolCallResult | undefined)[] = new Array(calls.length);
  const toolMessages: (ToolMessage | undefined)[] = new Array(calls.length);
  const saved = loadCheckpoint(ctx.state, ctx.nodeId);
  if (saved) {
    for (const { idx, result } of validCheckpointEntries(saved, calls)) {
      const call = calls[idx];
      if (!call) {
        continue;
      }
      results[idx] = result;
      toolMessages[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: await presentCallOutput(ctx, call, result.result),
      });
    }
  }
  async function runCall(idx: number): Promise<void> {
    const call = calls[idx];
    if (!call || results[idx] !== undefined) {
      return;
    }
    const done = await runSingleToolCall(call, ctx, idx);
    results[idx] = done.result;
    toolMessages[idx] = done.message;
    recordCompleted(ctx.state, ctx.nodeId, idx, done.result);
  }
  const pendingFree = freeIdx.filter((i) => results[i] === undefined);
  if (pendingFree.length > 0) {
    const width =
      node.concurrency === 'sequential'
        ? 1
        : Math.min(pendingFree.length, ctx.hostMaxConcurrency ?? pendingFree.length);
    await runBatchWorkerPool({ indexes: pendingFree, width, run: runCall });
  }
  for (const callIdx of needsApproveIdx) {
    if (results[callIdx] !== undefined) {
      continue;
    }
    if (ctx.sandbox) {
      const call = calls[callIdx];
      if (!call) {
        continue;
      }
      const reason = sandboxDenyText(call.name, 'approval');
      recordDenied(ctx.state, call.id, { tool: call.name, reason });
      const denied = { id: call.id, name: call.name, result: reason, isError: true };
      results[callIdx] = denied;
      toolMessages[callIdx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: reason,
      });
      recordCompleted(ctx.state, ctx.nodeId, callIdx, denied);
      continue;
    }
    const call = calls[callIdx];
    if (!call) {
      continue;
    }
    const batchResumeMatches = ctx.resumeInterruptId === `batch/${ctx.nodeExecutionId}/${callIdx}`;
    if (batchResumeMatches && ctx.resumeRejected === true) {
      const skipped = skippedGateResult(call, ctx);
      results[callIdx] = skipped.result;
      toolMessages[callIdx] = skipped.message;
      recordCompleted(ctx.state, ctx.nodeId, callIdx, skipped.result);
      ctx.resumePayload = undefined;
    } else if (ctx.resumePayload !== undefined && batchResumeMatches) {
      const payload = ctx.resumePayload as ApproveResumePayload;
      if (payload.approved) {
        await runCall(callIdx);
      } else {
        const skipped = skippedGateResult(call, ctx);
        results[callIdx] = skipped.result;
        toolMessages[callIdx] = skipped.message;
        recordCompleted(ctx.state, ctx.nodeId, callIdx, skipped.result);
      }
      ctx.resumePayload = undefined;
    } else {
      throw new AskUserInterrupt({
        prompt: approve.reason,
        source: 'approve',
        tool: { name: call.name, input: call.args, toolCallId: call.id },
        interruptId: `batch/${ctx.nodeExecutionId}/${callIdx}`,
        resumeSchema: approve.resumeSchema,
      });
    }
  }
  for (let i = 0; i < calls.length; i++) {
    if (results[i] !== undefined) {
      continue;
    }
    const call = calls[i];
    if (!call) {
      continue;
    }
    const content = 'skipped: no result recorded';
    results[i] = { id: call.id, name: call.name, result: content, isError: true, skipped: true };
    toolMessages[i] = buildToolMessage({ toolCallId: call.id, name: call.name, content });
  }
  clearCheckpoint(ctx.state, ctx.nodeId);
  return { results: results as ToolCallResult[], toolMessages };
}
