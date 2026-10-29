import { SPAWN_ITEM_LIMIT, SPAWN_MAX_CONCURRENCY } from '../constants.ts';
import type { AgentBudget, AgentDefinition, NodePlacement } from '../domain/agent-definition.ts';
import { codedRunError, DelegatedPermissionAsk } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { HookEffect } from '../domain/hook.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { AgentRosterEntry, AgentsResolve } from '../ports/create-runtime.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { formatAgentTargets, resolveAgentTarget } from './agent-target-resolve.ts';
import { type BudgetRemainder, childBudgetInPool } from './budget.ts';
import { resolveCapabilitySet, sandboxUniverse } from './capability-set.ts';
import { compileOrThrow, type Plan } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import {
  emitHook,
  hookContextText,
  hookStopEffect,
  withHookContextPrefix,
} from './hooks/emit-hook.ts';
import { childPermissions } from './permissions.ts';
import { finalProviderMessage, isProviderError, providerErrorCode } from './provider-error.ts';
import { type DeniedToolEntry, deniedToolsList } from './tool-approve-checkpoint.ts';
import { runBatchWorkerPool } from './tool-pool.ts';
import { subtractDeniedTools } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';
export interface SpawnCall {
  agentId: string;
  spawnId?: string;
  input: unknown;
  budget?: AgentBudget;
  permissions?: PermissionMap;
  placement?: NodePlacement;
}
export const WORK_RESULT_EVENT = 'work.completed';
export interface SpawnBudgetHit {
  kind: 'steps' | 'tokens' | 'deadline';
  limit: number;
  used: number;
  closingStep: true;
}
export interface SpawnCallError {
  code: string;
  message: string;
}
export interface SpawnResultItem {
  agentId: string;
  spawnId: string;
  output: unknown;
  error?: SpawnCallError;
  blocked?: DeniedToolEntry[];
  budget?: SpawnBudgetHit;
  usage?: SpawnUsage;
}
export interface SpawnUsage {
  steps: number;
  tokens: number;
}
export interface DelegatedAskResume {
  spawnId: string;
  childInterruptId: string;
  childNodeId: string;
  approved: boolean;
  scope?: 'once' | 'run' | 'always';
}
export type SpawnDeniedItem = SpawnResultItem & {
  error: SpawnCallError;
};
export interface SpawnNodeSpec {
  type: 'control:spawn';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: {
    policy: 'all';
  };
  maxConcurrency?: number;
  timeoutMs?: number;
  onTimeout?: 'partial' | 'fail';
}
export interface SpawnSlots {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
}
export interface SpawnNodeOutcome {
  results: SpawnResultItem[];
  carried: SpawnResultItem[];
  timedOut: boolean;
}
export interface SpawnTarget {
  call: SpawnCall;
  def: AgentDefinition;
  spawnId: string;
  quota?: AgentBudget;
}
export interface PreparedSpawn {
  targets: SpawnTarget[];
  denied: SpawnDeniedItem[];
  carried: SpawnResultItem[];
  concurrency: 'parallel' | 'sequential';
  maxConcurrency: number;
  timeoutMs?: number;
  onTimeout: 'partial' | 'fail';
}
export type ChildRunner = (opts: GraphOpts) => AsyncIterable<Event>;
function resolveConcurrency(
  c: Expr | 'parallel' | 'sequential',
  slots: SpawnSlots,
): 'parallel' | 'sequential' {
  if (c === 'parallel' || c === 'sequential') {
    return c;
  }
  if (typeof c === 'string' && c.trim().startsWith('$')) {
    const val = evalExpr(c, slots);
    if (val === 'parallel' || val === 'sequential') {
      return val;
    }
    throw codedRunError('concurrency_invalid', `invalid concurrency ${String(val)}`);
  }
  throw codedRunError('concurrency_invalid', `invalid concurrency ${String(c)}`);
}
function resolveMaxConcurrency(node: SpawnNodeSpec): number {
  const raw = node.maxConcurrency;
  if (raw === undefined) {
    return SPAWN_MAX_CONCURRENCY;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw codedRunError('spawn_concurrency_invalid', 'maxConcurrency must be an integer >= 1');
  }
  return raw;
}
function resolveTimeoutMs(node: SpawnNodeSpec): number | undefined {
  const raw = node.timeoutMs;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
    throw codedRunError('spawn_timeout', 'timeoutMs must be a positive number');
  }
  return raw;
}
function resolveOnTimeout(node: SpawnNodeSpec): 'partial' | 'fail' {
  const raw = node.onTimeout;
  if (raw === undefined) {
    return 'partial';
  }
  if (raw !== 'partial' && raw !== 'fail') {
    throw codedRunError('spawn_timeout', "onTimeout must be 'partial' or 'fail'");
  }
  return raw;
}
export function parseSpawnBudget(raw: unknown): {
  budget?: AgentBudget;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'budget must be an object' };
  }
  const rec = raw as Record<string, unknown>;
  const out: AgentBudget = {};
  let any = false;
  for (const key of ['maxSteps', 'maxTokens', 'deadlineMs'] as const) {
    const v = rec[key];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return { error: `budget.${key} must be a non-negative number` };
    }
    (out as Record<string, unknown>)[key] = v;
    any = true;
  }
  if (!any) {
    return { error: 'budget must set at least one limit' };
  }
  return { budget: out };
}
export function parseSpawnPermissions(raw: unknown): {
  permissions?: PermissionMap;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'permissions must be an object' };
  }
  const out: PermissionMap = {};
  for (const [op, gate] of Object.entries(raw as Record<string, unknown>)) {
    if (gate !== 'allow' && gate !== 'ask' && gate !== 'deny') {
      return { error: `permissions.${op} must be allow|ask|deny` };
    }
    out[op] = gate;
  }
  return { permissions: out };
}
function parsePlacement(raw: unknown, label: string): NodePlacement | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw codedRunError('placement_conflict', `${label} must be an object`);
  }
  const rec = raw as Record<string, unknown>;
  const placement: NodePlacement = {};
  if (rec.node !== undefined) {
    if (typeof rec.node !== 'string' || !rec.node) {
      throw codedRunError('placement_conflict', `${label}.node must be string`);
    }
    placement.node = rec.node;
  }
  if (rec.tag !== undefined) {
    if (typeof rec.tag !== 'string' || !rec.tag) {
      throw codedRunError('placement_conflict', `${label}.tag must be string`);
    }
    placement.tag = rec.tag;
  }
  if (rec.sameAsParent !== undefined) {
    if (typeof rec.sameAsParent !== 'boolean') {
      throw codedRunError('placement_conflict', `${label}.sameAsParent must be boolean`);
    }
    placement.sameAsParent = rec.sameAsParent;
  }
  if (placement.node !== undefined && placement.tag !== undefined) {
    throw codedRunError('placement_conflict', `${label} cannot set node and tag together`);
  }
  return placement;
}
function parseCalls(raw: unknown): SpawnCall[] {
  if (!Array.isArray(raw)) {
    throw codedRunError('spawn_calls_shape', 'calls must be array');
  }
  if (raw.length > SPAWN_ITEM_LIMIT) {
    throw codedRunError('spawn_item_limit', `spawn calls exceed limit ${SPAWN_ITEM_LIMIT}`);
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw codedRunError('spawn_calls_shape', `calls[${idx}] must be object`);
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.agentId !== 'string' || !rec.agentId) {
      throw codedRunError('spawn_calls_shape', `calls[${idx}].agentId must be string`);
    }
    const parsed = parseSpawnBudget(rec.budget);
    if (parsed.error !== undefined) {
      throw codedRunError('spawn_calls_shape', `calls[${idx}].${parsed.error}`);
    }
    const parsedPermissions = parseSpawnPermissions(rec.permissions);
    if (parsedPermissions.error !== undefined) {
      throw codedRunError('spawn_calls_shape', `calls[${idx}].${parsedPermissions.error}`);
    }
    const placement = parsePlacement(rec.placement, `calls[${idx}].placement`);
    return {
      agentId: rec.agentId,
      ...(typeof rec.spawnId === 'string' && rec.spawnId ? { spawnId: rec.spawnId } : {}),
      input: rec.input,
      ...(parsed.budget !== undefined ? { budget: parsed.budget } : {}),
      ...(parsedPermissions.permissions !== undefined
        ? { permissions: parsedPermissions.permissions }
        : {}),
      ...(placement !== undefined ? { placement } : {}),
    };
  });
}
interface ResolvedTargets {
  targets: SpawnTarget[];
  denied: SpawnDeniedItem[];
}
function resolveTargets(
  calls: SpawnCall[],
  agents: AgentsResolve,
  parent: AgentDefinition,
): ResolvedTargets {
  const runAgentId = parent.id;
  const targets: SpawnTarget[] = [];
  const denied: SpawnDeniedItem[] = [];
  const roster: AgentRosterEntry[] = agents.list?.(parent) ?? [];
  const deny = (agentId: string, message: string): void => {
    denied.push({
      agentId,
      spawnId: crypto.randomUUID(),
      output: null,
      error: { code: 'spawn_target_missing', message },
    });
  };
  for (const call of calls) {
    const rosterEntry = roster.find((e) => e.id === call.agentId);
    const foreign =
      rosterEntry !== undefined &&
      rosterEntry.parentId != null &&
      rosterEntry.parentId !== runAgentId;
    let def = foreign ? undefined : agents.resolve(call.agentId, parent);
    if (!def && rosterEntry === undefined && roster.length > 0) {
      const visible = roster.filter(
        (entry) => entry.parentId == null || entry.parentId === runAgentId,
      );
      const hit = resolveAgentTarget(call.agentId, visible);
      if ('error' in hit) {
        deny(call.agentId, hit.error);
        continue;
      }
      def = agents.resolve(hit.id, parent);
    }
    if (!def) {
      const available = roster.length > 0 ? formatAgentTargets(roster) : '(none)';
      deny(call.agentId, `unknown spawn target "${call.agentId}". Available agents: ${available}`);
      continue;
    }
    const spawnId = call.spawnId ?? crypto.randomUUID();
    targets.push({ call, def, spawnId });
  }
  return { targets, denied };
}
function spawnBudgetHit(
  snap: Snapshot | null | undefined,
  b: AgentBudget | undefined,
): SpawnBudgetHit | undefined {
  const cb = snap?.cursor.budget;
  if (b === undefined || cb === undefined) {
    return undefined;
  }
  if (b.maxSteps !== undefined && cb.steps >= b.maxSteps) {
    return { kind: 'steps', limit: b.maxSteps, used: cb.steps, closingStep: true };
  }
  if (b.maxTokens !== undefined && cb.tokens >= b.maxTokens) {
    return { kind: 'tokens', limit: b.maxTokens, used: cb.tokens, closingStep: true };
  }
  if (b.deadlineMs !== undefined) {
    const used = Date.now() - cb.startedAt;
    if (used >= b.deadlineMs) {
      return { kind: 'deadline', limit: b.deadlineMs, used, closingStep: true };
    }
  }
  return undefined;
}
function childOutputFromState(state: Record<string, unknown>): unknown {
  const msgs = state.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    return msgs[msgs.length - 1];
  }
  return state;
}
function usageOf(snap: Snapshot | null): SpawnUsage {
  const cb = snap?.cursor.budget;
  return { steps: cb?.steps ?? 0, tokens: cb?.tokens ?? 0 };
}
function errorCodeOf(err: unknown): string {
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return 'spawn_child_failed';
}
function errorMessageOf(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'spawn child failed';
}
export interface SpawnAbort {
  timedOut: boolean;
  timeoutMs?: number;
}
function abortError(abort: SpawnAbort): SpawnCallError {
  if (abort.timedOut) {
    return {
      code: 'spawn_timeout',
      message: `spawn timed out after ${abort.timeoutMs ?? 0}ms`,
    };
  }
  return { code: 'spawn_aborted', message: 'spawn aborted before the child finished' };
}
async function runOneChild(input: {
  parent: GraphOpts;
  target: SpawnTarget;
  runChild: ChildRunner;
  signal: AbortSignal;
  abort: SpawnAbort;
  childResume?: DelegatedAskResume;
}): Promise<SpawnResultItem | undefined> {
  const { parent, target, runChild, signal, abort, childResume } = input;
  const startOutcome = await emitHook(parent.hooks, 'SubagentStart', {
    agent_type: target.call.agentId,
  });
  const childInput = withHookContextPrefix(target.call.input, hookContextText(startOutcome));
  const stopEvent = async (): Promise<Extract<HookEffect, { kind: 'stop' }> | undefined> => {
    const outcome = await emitHook(parent.hooks, 'SubagentStop', {
      agent_type: target.call.agentId,
    });
    return hookStopEffect(outcome);
  };
  const childState: RuntimeState = parent.state.child(target.spawnId);
  const modelInherited =
    target.def.model === undefined && parent.agent.model !== undefined
      ? { ...target.def, model: parent.agent.model }
      : target.def;
  const childBudget = target.quota
    ? { ...(target.call.budget ?? modelInherited.budget ?? parent.agent.budget), ...target.quota }
    : (target.call.budget ?? modelInherited.budget ?? parent.agent.budget);
  const childDef =
    childBudget === modelInherited.budget
      ? modelInherited
      : { ...modelInherited, budget: childBudget };
  let plan: Plan;
  try {
    plan = compileOrThrow(childDef);
  } catch (err) {
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: {
        code: 'agent_invalid',
        message: err instanceof Error && err.message ? err.message : 'child agent is invalid',
      },
    };
  }
  let childPackOutputs = parent.packOutputs;
  let runRegistry: Map<string, ToolDefinition>;
  if (parent.universe !== undefined) {
    const childSet = resolveCapabilitySet(childDef, sandboxUniverse(parent.universe));
    if (childSet.fatal.length > 0) {
      parent.logger?.warn(
        `[capabilities] spawn ${target.call.agentId}: ${childSet.fatal.join('; ')}`,
      );
    }
    runRegistry = new Map(
      [...childSet.registry].map(([name, entry]) => [
        name,
        { ...entry.def, exposure: entry.exposure },
      ]),
    );
    childPackOutputs = childSet.packOutputs;
  } else {
    runRegistry = subtractDeniedTools(parent.toolRegistry, childDef);
    for (const [name, def] of runRegistry) {
      if (def.group === 'agents') {
        runRegistry.delete(name);
      }
    }
    runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  }
  const childSpawnPath = parent.spawnPath
    ? `${parent.spawnPath}/${target.spawnId}`
    : target.spawnId;
  const childOpts: GraphOpts = {
    agent: childDef,
    input: childInput,
    state: childState,
    permissions: childPermissions({
      grant: target.call.permissions,
      childDef: target.def.permissions,
      parent: parent.permissions,
    }),
    paths: parent.paths,
    process: parent.process,
    models: parent.models,
    fileAccess: parent.fileAccessFor?.(childDef) ?? parent.fileAccess,
    toolRegistry: runRegistry,
    plan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal,
    notes: parent.notes,
    packOutputs: childPackOutputs,
    universe: parent.universe,
    skills: parent.skills,
    env: parent.env,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    placement: target.call.placement,
    logger: parent.logger,
    sandbox: true,
    spawnPath: childSpawnPath,
    ...(childResume?.spawnId === target.spawnId
      ? {
          startNodeId: childResume.childNodeId,
          resumeInterruptId: childResume.childInterruptId,
          resumePayload: {
            approved: childResume.approved,
            ...(childResume.scope !== undefined ? { scope: childResume.scope } : {}),
          },
        }
      : {}),
  };
  let blocked: DeniedToolEntry[] = [];
  let remoteOutput: { output: unknown } | undefined;
  const readBlocked = async (): Promise<void> => {
    try {
      const snap = await childState.load();
      blocked = deniedToolsList((snap?.state as Record<string, unknown>) ?? {});
    } catch {
      blocked = [];
    }
  };
  const blockedProp = (): {
    blocked?: DeniedToolEntry[];
  } => (blocked.length > 0 ? { blocked } : {});
  try {
    for await (const ev of runChild(childOpts)) {
      if (ev.type === WORK_RESULT_EVENT) {
        const meta = ev.metadata as Record<string, unknown> | undefined;
        remoteOutput = { output: meta?.output ?? null };
      }
      parent.childJournal?.(target.spawnId, ev);
    }
  } catch (err) {
    if (signal.aborted && signal.reason === 'delegated_ask') {
      return undefined;
    }
    const providerFailure = isProviderError(err);
    const code = providerFailure ? providerErrorCode(err) : errorCodeOf(err);
    const message = providerFailure ? finalProviderMessage(err) : errorMessageOf(err);
    await readBlocked();
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: signal.aborted ? abortError(abort) : { code, message },
      ...blockedProp(),
    };
  }
  if (remoteOutput !== undefined) {
    await readBlocked();
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: remoteOutput.output,
      ...blockedProp(),
    };
  }
  const snap = await childState.load();
  const status = snap?.status ?? 'failed';
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  blocked = deniedToolsList(rec);
  if (status === 'completed') {
    const stopped = await stopEvent();
    if (stopped !== undefined) {
      return {
        agentId: target.call.agentId,
        spawnId: target.spawnId,
        output: null,
        error: {
          code: 'stopped_by_hook',
          message: stopped.reason ?? 'stopped by hook',
        },
        ...blockedProp(),
      };
    }
    const over = spawnBudgetHit(snap, childBudget);
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: childOutputFromState(rec),
      ...(over !== undefined ? { budget: over } : {}),
      usage: usageOf(snap),
      ...blockedProp(),
    };
  }
  if (status === 'needs_input') {
    const interrupt = snap?.cursor.interrupt;
    if (interrupt && interrupt.source === 'permission') {
      await stopEvent();
      throw new DelegatedPermissionAsk({
        agentId: target.call.agentId,
        agentType: target.call.agentId,
        spawnId: target.spawnId,
        spawnPath: childSpawnPath,
        childInterruptId: interrupt.interruptId,
        childNodeId: interrupt.nodeId,
        prompt: interrupt.reason,
        tool: interrupt.tool
          ? {
              name: interrupt.tool.name,
              input: interrupt.tool.input,
              toolCallId: interrupt.tool.toolCallId,
            }
          : undefined,
      });
    }
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: {
        code: 'sandbox_blocked',
        message: `spawn child ended with status ${status}`,
      },
      ...blockedProp(),
    };
  }
  await stopEvent();
  if (signal.aborted) {
    if (signal.reason === 'delegated_ask') {
      return undefined;
    }
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: abortError(abort),
      ...blockedProp(),
    };
  }
  return {
    agentId: target.call.agentId,
    spawnId: target.spawnId,
    output: null,
    error: {
      code: status,
      message: `spawn child ended with status ${status}`,
    },
    ...blockedProp(),
  };
}
export function prepareSpawn(
  node: SpawnNodeSpec,
  parent: GraphOpts,
  slots: SpawnSlots,
  done?: SpawnResultItem[],
  remainder?: BudgetRemainder,
): PreparedSpawn {
  if (parent.sandbox) {
    throw codedRunError('spawn_in_sandbox', 'spawn is not allowed in a sandboxed run');
  }
  if (node.barrier !== undefined && node.barrier.policy !== 'all') {
    throw codedRunError('barrier_policy', 'barrier.policy must be "all"');
  }
  const rawCalls = evalExpr(node.calls, slots);
  const calls = parseCalls(rawCalls);
  const doneResults = (done ?? []).filter((r) => calls.some((c) => c.spawnId === r.spawnId));
  const pendingCalls =
    doneResults.length > 0
      ? calls.filter((c) => !doneResults.some((r) => r.spawnId === c.spawnId))
      : calls;
  const concurrency = resolveConcurrency(node.concurrency, slots);
  const maxConcurrency = resolveMaxConcurrency(node);
  const timeoutMs = resolveTimeoutMs(node);
  const onTimeout = resolveOnTimeout(node);
  const { targets, denied } = resolveTargets(pendingCalls, parent.agents, parent.agent);
  const pooled = parent.agent.budget?.spawnBudget !== 'inherit';
  if (pooled && remainder !== undefined && targets.length > 0) {
    for (const target of targets) {
      target.quota = childBudgetInPool(remainder, target.call.budget, targets.length);
    }
  }
  return {
    targets,
    denied,
    carried: doneResults,
    concurrency,
    maxConcurrency,
    timeoutMs,
    onTimeout,
  };
}
export async function executeSpawn(
  prepared: PreparedSpawn,
  parent: GraphOpts,
  runChild: ChildRunner,
  onChildDone?: (result: SpawnResultItem) => Promise<void> | void,
  childResume?: DelegatedAskResume,
): Promise<SpawnNodeOutcome> {
  const { targets, concurrency, carried, maxConcurrency, timeoutMs, onTimeout } = prepared;
  const results: (SpawnResultItem | undefined)[] = new Array(targets.length);
  let delegatedAsk: DelegatedPermissionAsk | undefined;
  const ac = new AbortController();
  const onParentAbort = (): void => ac.abort(parent.signal?.reason);
  if (parent.signal?.aborted) {
    ac.abort(parent.signal.reason);
  } else {
    parent.signal?.addEventListener('abort', onParentAbort, { once: true });
  }
  const abort: SpawnAbort = { timedOut: false, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      abort.timedOut = true;
      ac.abort('spawn_timeout');
    }, timeoutMs);
  }
  const settleOne = async (i: number, t: SpawnTarget): Promise<void> => {
    if (ac.signal.aborted) {
      if (delegatedAsk !== undefined) {
        return;
      }
      const item: SpawnResultItem = {
        agentId: t.call.agentId,
        spawnId: t.spawnId,
        output: null,
        error: abortError(abort),
      };
      results[i] = item;
      await onChildDone?.(item);
      return;
    }
    let item: SpawnResultItem | undefined;
    try {
      item = await runOneChild({
        parent,
        target: t,
        runChild,
        signal: ac.signal,
        abort,
        ...(childResume ? { childResume } : {}),
      });
    } catch (err) {
      if (err instanceof DelegatedPermissionAsk) {
        delegatedAsk ??= err;
        ac.abort('delegated_ask');
        return;
      }
      throw err;
    }
    if (item === undefined) {
      return;
    }
    results[i] = item;
    await onChildDone?.(item);
  };
  const width = concurrency === 'sequential' ? 1 : Math.min(maxConcurrency, targets.length);
  try {
    await runBatchWorkerPool({
      indexes: targets.map((_, i) => i),
      width,
      run: (i) => {
        const t = targets[i];
        if (!t) {
          return Promise.resolve();
        }
        return settleOne(i, t);
      },
    });
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    parent.signal?.removeEventListener('abort', onParentAbort);
  }
  if (delegatedAsk !== undefined) {
    throw delegatedAsk;
  }
  if (abort.timedOut && onTimeout === 'fail') {
    throw codedRunError('spawn_timeout', `spawn timed out after ${timeoutMs ?? 0}ms`);
  }
  return {
    results: results.filter((r): r is SpawnResultItem => r !== undefined),
    carried,
    timedOut: abort.timedOut,
  };
}
