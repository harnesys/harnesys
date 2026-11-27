import { EVENT_TYPES, SPAWN_ITEM_LIMIT, SPAWN_MAX_CONCURRENCY } from '../constants.ts';
import type { AgentBudget, AgentDefinition, NodePlacement } from '../domain/agent-definition.ts';
import { codedRunError, DelegatedPermissionAsk } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { HookEffect } from '../domain/hook.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { AgentRosterEntry, AgentsResolve } from '../ports/create-runtime.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import {
  isSideEffect,
  MUTATING_SIDE_EFFECTS,
  type SpawnEffectEntry,
  type SpawnEffectsJournal,
  type SpawnToolUse,
  type ToolDefinition,
} from '../ports/tools.ts';
import { formatAgentTargets, resolveAgentTarget } from './agent-target-resolve.ts';
import { capabilityDigest, createCapabilityLinesProvider } from './capability-digest.ts';
import { deniedOpReason, INTERACTIVE_HIDDEN_REASON } from './capability-explain.ts';
import type { CapabilitySet, CapabilityUniverse } from './capability-set.ts';
import {
  CORE_SERVICE_TOOLS,
  projectToolRegistry,
  resolveCapabilitySet,
  sandboxUniverse,
} from './capability-set.ts';
import { compileOrThrow, type Plan } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import {
  emitHook,
  hookContextText,
  hookStopEffect,
  withHookContextPrefix,
} from './hooks/emit-hook.ts';
import { effectiveSkillRegistry } from './packs/pack-run.ts';
import { childPermissions } from './permissions.ts';
import { finalProviderMessage, isProviderError, providerErrorCode } from './provider-error.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';
import { type DeniedToolEntry, deniedToolsList } from './tool-approve-checkpoint.ts';
import { runBatchWorkerPool } from './tool-pool.ts';
import { subtractDeniedTools } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';
import { aliasTool } from './tools/tool-alias.ts';
export interface SpawnCall {
  agentId: string;
  spawnId?: string;
  input: unknown;
  budget?: AgentBudget;
  permissions?: PermissionMap;
  placement?: NodePlacement;
  background?: boolean;
}
export const WORK_RESULT_EVENT = 'work.completed';
export interface SpawnBudgetHit {
  kind: 'steps' | 'tokens' | 'deadline';
  limit: number;
  used: number;
  closingStep: boolean;
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
  quota?: AgentBudget;
  usage?: SpawnUsage;
  effects?: SpawnEffectsJournal;
  caps?: string[];
  toolUse?: SpawnToolUse;
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
  background: BackgroundSpawnHandle[];
  timedOut: boolean;
}
export interface SpawnTarget {
  call: SpawnCall;
  def: AgentDefinition;
  spawnId: string;
  quota?: AgentBudget;
  background?: boolean;
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
export interface ChildAbortRegistry {
  register(spawnId: string, controller: AbortController): void;
  release(spawnId: string): void;
  abort(spawnId: string, reason?: unknown): boolean;
}
export interface BackgroundSpawnHandle {
  runId: string;
  threadId: string;
  spawnId: string;
  agentId: string;
  agentName?: string;
  status: 'running' | 'done' | 'failed';
  output?: unknown;
  error?: SpawnCallError;
  effects?: SpawnEffectsJournal;
  caps?: string[];
  toolUse?: SpawnToolUse;
  lastActivityAt: number;
}
export interface BackgroundSpawnRegistry {
  track(input: {
    runId: string;
    threadId: string;
    spawnId: string;
    agentId: string;
    agentName?: string;
    controller: AbortController;
    run: (signal: AbortSignal) => Promise<SpawnResultItem | null>;
  }): Promise<BackgroundSpawnHandle>;
  isTracked(runId: string, spawnId: string): boolean;
  list(runId: string): BackgroundSpawnHandle[];
  listByThread(threadId: string): BackgroundSpawnHandle[];
  pendingCount(runId: string): number;
  awaitAll(runId: string, timeoutMs?: number): Promise<BackgroundSpawnHandle[]>;
  awaitByThread(threadId: string, timeoutMs?: number): Promise<BackgroundSpawnHandle[]>;
  abortRun(runId: string, reason?: unknown): void;
  abortSpawn(spawnId: string, reason?: unknown): boolean;
  abortAll(reason?: unknown): void;
}
export interface BackgroundReportInput {
  runId: string;
  threadId: string;
  spawnId: string;
  agentId: string;
  parentAgentId: string;
  agentName?: string;
  output?: unknown;
  error?: SpawnCallError;
  effects?: SpawnEffectsJournal;
  caps?: string[];
}
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
      throw codedRunError('spawn_budget_invalid', `calls[${idx}].${parsed.error}`);
    }
    if (parsed.budget === undefined) {
      throw codedRunError(
        'spawn_budget_required',
        `calls[${idx}].budget is required: children run in a sandbox, never ask, and their budgets are set per call (maxSteps/maxTokens/deadlineMs), independent of the parent's own budget — an uncapped child could outlive the delegation. Set explicit caps for this child.`,
      );
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
      ...(rec.background === true ? { background: true } : {}),
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
    targets.push({ call, def, spawnId, ...(call.background === true ? { background: true } : {}) });
  }
  return { targets, denied };
}
function spawnBudgetHit(
  snap: Snapshot | null | undefined,
  b: AgentBudget | undefined,
  closingStep: boolean,
): SpawnBudgetHit | undefined {
  const cb = snap?.cursor.budget;
  if (b === undefined || cb === undefined) {
    return undefined;
  }
  if (b.maxSteps !== undefined && cb.steps >= b.maxSteps) {
    return { kind: 'steps', limit: b.maxSteps, used: cb.steps, closingStep };
  }
  if (b.maxTokens !== undefined && cb.tokens >= b.maxTokens) {
    return { kind: 'tokens', limit: b.maxTokens, used: cb.tokens, closingStep };
  }
  if (b.deadlineMs !== undefined) {
    const used = Date.now() - cb.startedAt;
    if (used >= b.deadlineMs) {
      return { kind: 'deadline', limit: b.deadlineMs, used, closingStep };
    }
  }
  return undefined;
}
export function composedReportOf(state: Record<string, unknown>): unknown {
  const msgs = state.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return undefined;
  }
  const last = msgs[msgs.length - 1];
  if (last === null || typeof last !== 'object') {
    return undefined;
  }
  const rec = last as { role?: unknown; content?: unknown };
  if (rec.role !== 'assistant' || typeof rec.content !== 'string' || rec.content.trim() === '') {
    return undefined;
  }
  return last;
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
const EFFECTS_MAX_ENTRIES = 32;
const EFFECT_NOTE_MAX_CHARS = 140;

function effectNoteOf(output: unknown): string | undefined {
  if (typeof output !== 'string' || output.trim() === '') {
    return undefined;
  }
  const flat = output.replace(/\s+/g, ' ').trim();
  return flat.length > EFFECT_NOTE_MAX_CHARS ? `${flat.slice(0, EFFECT_NOTE_MAX_CHARS)}…` : flat;
}
function createEffectCollector() {
  const entries: SpawnEffectEntry[] = [];
  const used = new Set<string>();
  let total = 0;
  return {
    add(ev: Event): void {
      if (ev.type !== EVENT_TYPES.TOOL_COMPLETED && ev.type !== EVENT_TYPES.TOOL_FAILED) {
        return;
      }
      const meta = ev.metadata as Record<string, unknown> | undefined;
      const name = typeof meta?.name === 'string' ? meta.name : '';
      if (name !== '') {
        used.add(name);
      }
      const sideEffect = meta?.sideEffect;
      if (!isSideEffect(sideEffect) || !MUTATING_SIDE_EFFECTS.includes(sideEffect)) {
        return;
      }
      total += 1;
      if (entries.length < EFFECTS_MAX_ENTRIES) {
        const note = effectNoteOf(meta?.output);
        entries.push({
          tool: name,
          ok: ev.type === EVENT_TYPES.TOOL_COMPLETED,
          ...(note !== undefined ? { note } : {}),
        });
      }
    },
    usedTools(): string[] {
      return [...used];
    },
    absorb(names: Iterable<string>): void {
      for (const name of names) {
        if (name !== '') {
          used.add(name);
        }
      }
    },
    journal(): SpawnEffectsJournal | undefined {
      if (total === 0) {
        return undefined;
      }
      return { entries, omitted: total - entries.length };
    },
  };
}
export interface SpawnAbort {
  timedOut: boolean;
  timeoutMs?: number;
}
function usedNamesFromState(state: Record<string, unknown> | undefined): string[] {
  const messages = Array.isArray(state?.messages) ? (state?.messages as readonly unknown[]) : [];
  const names = new Set<string>();
  for (const item of messages) {
    const msg = item as { role?: string; name?: string; toolCalls?: readonly { name?: string }[] };
    if (msg.role === 'tool' && typeof msg.name === 'string') {
      names.add(msg.name);
    }
    for (const call of msg.toolCalls ?? []) {
      if (typeof call.name === 'string') {
        names.add(call.name);
      }
    }
  }
  return [...names];
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
interface QuotaProp {
  quota?: AgentBudget;
}
function quotaProp(target: SpawnTarget): QuotaProp {
  return target.quota === undefined ? {} : { quota: target.quota };
}
function spawnInheritedUniverse(
  parent: GraphOpts,
  childDef: AgentDefinition,
  permissions: PermissionMap,
): CapabilityUniverse {
  const registrations = [...(parent.packOutputs?.values() ?? [])].map((entry) => entry.reg);
  const mcpTools = new Map(
    [...parent.toolRegistry].filter(([, def]) => def.operations?.includes('mcp') === true),
  );
  const fsSkills = parent.skills;
  const parentDef = parent.agent;
  return {
    registrations,
    baseRegistry: mcpTools,
    roster: parent.agents.list?.(childDef) ?? [],
    ...(fsSkills !== undefined ? { fsSkills } : {}),
    makeLoadTools: (registry) => createLoadToolsTool(projectToolRegistry(registry)),
    makeLoadSkill: (packOutputs) => {
      const loadSkill = createLoadSkillTool(
        effectiveSkillRegistry(parentDef, fsSkills, packOutputs),
        {
          ...(fsSkills === undefined ? {} : { installed: fsSkills }),
        },
      );
      return [loadSkill, aliasTool(loadSkill, 'Skill')];
    },
    sandbox: true,
    permissions,
  };
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
  const childBudget = target.quota;
  const childDef =
    childBudget === undefined ? modelInherited : { ...modelInherited, budget: childBudget };
  let plan: Plan;
  try {
    plan = compileOrThrow(childDef);
  } catch (err) {
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      ...quotaProp(target),
      output: null,
      error: {
        code: 'agent_invalid',
        message: err instanceof Error && err.message ? err.message : 'child agent is invalid',
      },
    };
  }
  let childPackOutputs = parent.packOutputs;
  const childPerms = childPermissions({
    grant: target.call.permissions,
    childDef: target.def.permissions,
    parent: parent.permissions,
  });
  const childCaps: string[] = [];
  let runRegistry: Map<string, ToolDefinition>;
  const explicitPacks = Object.keys(childDef.packs ?? {}).length > 0;
  let childSet: CapabilitySet | undefined;
  if (parent.universe !== undefined) {
    childSet = resolveCapabilitySet(childDef, sandboxUniverse(parent.universe, childPerms));
  } else if (parent.packOutputs !== undefined && explicitPacks) {
    childSet = resolveCapabilitySet(childDef, spawnInheritedUniverse(parent, childDef, childPerms));
  }
  if (childSet !== undefined) {
    if (childSet.fatal.length > 0) {
      parent.logger?.warn(
        `[capabilities] spawn ${target.call.agentId}: ${childSet.fatal.join('; ')}`,
      );
    }
    runRegistry = projectToolRegistry(childSet.registry);
    childCaps.push(...capabilityDigest(childSet.explain, new Set(childSet.registry.keys())));
    childPackOutputs = childSet.packOutputs;
    if (parent.universe === undefined && !runRegistry.has(LOAD_TOOLS_NAME)) {
      runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
    }
  } else {
    runRegistry = subtractDeniedTools(parent.toolRegistry, childDef);
    for (const [name, def] of runRegistry) {
      if (def.group === 'agents') {
        runRegistry.delete(name);
        continue;
      }
      if (def.interactive === true) {
        runRegistry.delete(name);
        childCaps.push(`${name} — ${INTERACTIVE_HIDDEN_REASON}`);
        continue;
      }
      const deniedOp = (def.operations ?? []).find((op) => childPerms[op] === 'deny');
      if (deniedOp !== undefined) {
        runRegistry.delete(name);
        childCaps.push(`${name} — ${deniedOpReason(deniedOp)}`);
      }
    }
    runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  }
  const childSpawnPath = parent.spawnPath
    ? `${parent.spawnPath}/${target.spawnId}`
    : target.spawnId;
  const childInterruptOutput =
    childResume?.spawnId === target.spawnId
      ? ((await childState.load())?.cursor.interrupt?.output ?? null)
      : undefined;
  const childOpts: GraphOpts = {
    agent: childDef,
    input: childInput,
    state: childState,
    runId: target.spawnId,
    permissions: childPerms,
    paths: parent.paths,
    process: parent.process,
    ...(parent.permissionGrants !== undefined ? { permissionGrants: parent.permissionGrants } : {}),
    models: parent.models,
    fileAccess: parent.fileAccessFor?.(childDef) ?? parent.fileAccess,
    toolRegistry: runRegistry,
    plan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal,
    notes: [...(parent.notes ?? []), createCapabilityLinesProvider(childCaps)],
    packOutputs: childPackOutputs,
    universe: parent.universe,
    skills: parent.skills,
    env: parent.env,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    ...(parent.steerFor ? { steerFor: parent.steerFor } : {}),
    ...(parent.ackSteerMessages ? { ackSteerMessages: parent.ackSteerMessages } : {}),
    placement: target.call.placement,
    logger: parent.logger,
    sandbox: true,
    spawnPath: childSpawnPath,
    ...(childResume?.spawnId === target.spawnId
      ? {
          startNodeId: childResume.childNodeId,
          outputHint: childInterruptOutput,
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
  const effects = createEffectCollector();
  const effectsProp = (): {
    effects?: SpawnEffectsJournal;
  } => {
    const journal = effects.journal();
    return journal === undefined ? {} : { effects: journal };
  };
  const capsProp = (): {
    caps?: string[];
  } => (childCaps.length > 0 ? { caps: childCaps } : {});
  const toolUseProp = (): {
    toolUse?: SpawnToolUse;
  } => {
    const offered = [...runRegistry.keys()].filter((n) => !CORE_SERVICE_TOOLS.includes(n));
    const offeredSet = new Set(offered);
    const used = effects.usedTools().filter((n) => offeredSet.has(n));
    const usedSet = new Set(used);
    return {
      toolUse: {
        total: offered.length,
        used,
        unused: offered.filter((n) => !usedSet.has(n)),
      },
    };
  };
  parent.childJournal?.(target.spawnId, {
    eventId: crypto.randomUUID(),
    type: 'child.prepared',
    timestamp: Date.now(),
    sessionId: childState.sessionId,
    runId: target.spawnId,
    agentId: target.def.id,
    sequence: 0,
    ...(childCaps.length > 0 ? { metadata: { caps: childCaps } } : {}),
  });
  try {
    for await (const ev of runChild(childOpts)) {
      if (ev.type === WORK_RESULT_EVENT) {
        const meta = ev.metadata as Record<string, unknown> | undefined;
        remoteOutput = { output: meta?.output ?? null };
      }
      effects.add(ev);
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
      ...quotaProp(target),
      output: null,
      error: signal.aborted ? abortError(abort) : { code, message },
      ...blockedProp(),
      ...effectsProp(),
      ...capsProp(),
      ...toolUseProp(),
    };
  }
  if (remoteOutput !== undefined) {
    await readBlocked();
    await stopEvent();
    const remoteSnap = await childState.load();
    effects.absorb(usedNamesFromState(remoteSnap?.state as Record<string, unknown> | undefined));
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      ...quotaProp(target),
      output: remoteOutput.output,
      ...blockedProp(),
      ...effectsProp(),
      ...capsProp(),
      ...toolUseProp(),
    };
  }
  const snap = await childState.load();
  const status = snap?.status ?? 'failed';
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  blocked = deniedToolsList(rec);
  effects.absorb(usedNamesFromState(rec));
  if (status === 'completed') {
    const stopped = await stopEvent();
    if (stopped !== undefined) {
      return {
        agentId: target.call.agentId,
        spawnId: target.spawnId,
        ...quotaProp(target),
        output: null,
        error: {
          code: 'stopped_by_hook',
          message: stopped.reason ?? 'stopped by hook',
        },
        ...blockedProp(),
        ...effectsProp(),
        ...capsProp(),
        ...toolUseProp(),
      };
    }
    const over = spawnBudgetHit(snap, childBudget, true);
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      ...quotaProp(target),
      output: childOutputFromState(rec),
      ...(over !== undefined ? { budget: over } : {}),
      usage: usageOf(snap),
      ...blockedProp(),
      ...capsProp(),
      ...toolUseProp(),
    };
  }
  if (status === 'needs_input') {
    const interrupt = snap?.cursor.interrupt;
    if (interrupt && interrupt.source === 'permission') {
      await stopEvent();
      throw new DelegatedPermissionAsk({
        agentId: target.call.agentId,
        agentType: target.def.name ?? target.call.agentId,
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
      ...quotaProp(target),
      output: null,
      error: {
        code: 'sandbox_blocked',
        message: `spawn child ended with status ${status}`,
      },
      ...blockedProp(),
      ...effectsProp(),
      ...capsProp(),
      ...toolUseProp(),
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
      ...quotaProp(target),
      output: null,
      error: abortError(abort),
      ...blockedProp(),
      ...effectsProp(),
      ...capsProp(),
      ...toolUseProp(),
    };
  }
  if (status === 'budget_exceeded') {
    const report = composedReportOf(rec);
    const over = spawnBudgetHit(snap, childBudget, report !== undefined);
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      ...quotaProp(target),
      output: report ?? null,
      error: {
        code: 'budget_exceeded',
        message: `spawn child ended with status ${status}`,
      },
      ...(over !== undefined ? { budget: over } : {}),
      usage: usageOf(snap),
      ...blockedProp(),
      ...effectsProp(),
      ...capsProp(),
      ...toolUseProp(),
    };
  }
  return {
    agentId: target.call.agentId,
    spawnId: target.spawnId,
    ...quotaProp(target),
    output: null,
    error: {
      code: status,
      message: `spawn child ended with status ${status}`,
    },
    ...blockedProp(),
    ...effectsProp(),
    ...capsProp(),
    ...toolUseProp(),
  };
}
export function prepareSpawn(
  node: SpawnNodeSpec,
  parent: GraphOpts,
  slots: SpawnSlots,
  done?: SpawnResultItem[],
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
  for (const target of targets) {
    target.quota = target.call.budget;
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
  const runOneChildTask = async (
    t: SpawnTarget,
    signal: AbortSignal,
  ): Promise<SpawnResultItem | undefined> => {
    const childAc = new AbortController();
    const relayAbort = (): void => childAc.abort(signal.reason);
    if (signal.aborted) {
      relayAbort();
    } else {
      signal.addEventListener('abort', relayAbort, { once: true });
    }
    const childAborts = parent.childAborts;
    childAborts?.register(t.spawnId, childAc);
    try {
      return await runOneChild({
        parent,
        target: t,
        runChild,
        signal: childAc.signal,
        abort,
        ...(childResume ? { childResume } : {}),
      });
    } finally {
      childAborts?.release(t.spawnId);
      signal.removeEventListener('abort', relayAbort);
    }
  };
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
      item = await runOneChildTask(t, ac.signal);
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
  const backgroundSpawns = parent.backgroundSpawns;
  const backgroundTargets =
    backgroundSpawns === undefined ? [] : targets.filter((t) => t.background === true);
  const blockingIndexes = targets
    .map((t, i) => (backgroundSpawns !== undefined && t.background === true ? -1 : i))
    .filter((i) => i >= 0);
  const startBackground = (t: SpawnTarget): void => {
    const runId = parent.runId ?? '';
    if (!backgroundSpawns || backgroundSpawns.isTracked(runId, t.spawnId)) {
      return;
    }
    const controller = new AbortController();
    const settled = backgroundSpawns.track({
      runId,
      threadId: parent.state.sessionId,
      spawnId: t.spawnId,
      agentId: t.call.agentId,
      agentName: t.def.name,
      controller,
      run: (signal: AbortSignal) => {
        return (async (): Promise<SpawnResultItem | null> => {
          try {
            return (await runOneChildTask(t, signal)) ?? null;
          } catch (err) {
            if (err instanceof DelegatedPermissionAsk) {
              return {
                agentId: t.call.agentId,
                spawnId: t.spawnId,
                output: null,
                error: {
                  code: 'delegated_ask',
                  message:
                    'background child requested a permission ask; grant permissions upfront via the spawn call',
                },
              };
            }
            throw err;
          }
        })();
      },
    });
    void settled
      .then((handle) => {
        parent.backgroundReport?.({
          runId,
          threadId: handle.threadId,
          spawnId: handle.spawnId,
          agentId: handle.agentId,
          parentAgentId: parent.agent.id,
          ...(handle.agentName !== undefined ? { agentName: handle.agentName } : {}),
          ...(handle.output !== undefined ? { output: handle.output } : {}),
          ...(handle.error !== undefined ? { error: handle.error } : {}),
          ...(handle.effects !== undefined ? { effects: handle.effects } : {}),
          ...(handle.caps !== undefined ? { caps: handle.caps } : {}),
        });
      })
      .catch(() => {});
  };
  for (const t of backgroundTargets) {
    startBackground(t);
  }
  const startedBackground =
    backgroundSpawns !== undefined && backgroundTargets.length > 0
      ? backgroundSpawns
          .list(parent.runId ?? '')
          .filter((h) => backgroundTargets.some((t) => t.spawnId === h.spawnId))
      : [];
  const width = concurrency === 'sequential' ? 1 : Math.min(maxConcurrency, blockingIndexes.length);
  try {
    await runBatchWorkerPool({
      indexes: blockingIndexes,
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
    background: startedBackground,
    timedOut: abort.timedOut,
  };
}
