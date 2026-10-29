import { DEFAULT_MEMORY_POLICY } from '@harnesys/contracts';
import {
  EVENT_TYPES,
  MEMORY_REMIND_DEFAULT,
  PASSTHROUGH_MODEL_EVENTS,
  STATE_SPAWN_RESULTS_KEY,
} from '../constants.ts';
import type {
  AgentDefinition,
  BudgetExtension,
  Node,
  NodePlacement,
  ToolCallBatch,
  ToolCallFixed,
} from '../domain/agent-definition.ts';
import type { Attachment, AttachmentKind } from '../domain/attachment.ts';
import { AskUserInterrupt, DelegatedPermissionAsk } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { ProcessJobTarget } from '../domain/process-job.ts';
import type { Event } from '../domain/snapshot.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { FileAccessPolicy } from '../ports/file-access.ts';
import type { Logger } from '../ports/logger.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimePromptInfo } from '../ports/runtime-prompt.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import {
  type BudgetLeft,
  type BudgetOver,
  type BudgetState,
  budgetInterruptId,
  budgetLeft,
  budgetLimitOf,
  budgetOver,
  budgetReason,
  budgetRemainder,
  budgetUsedOf,
  defaultExtension,
  extendState,
} from './budget.ts';
import type { CapabilitySet, CapabilityUniverse } from './capability-set.ts';
import { type CompactionSkipReason, runSummaryPassIfDue } from './compaction/run.ts';
import type { Plan } from './compile.ts';
import type { Slots } from './expr-eval.ts';
import { evalExpr } from './expr-eval.ts';
import {
  appendAssistantNote,
  appendMapResultsMessage,
  appendSpawnResultsMessage,
  applyAgentControlToolResults,
  clearQueuedHandoff,
  clearQueuedMap,
  clearQueuedSpawns,
  clearQueuedWait,
  collectPlanNodeTypes,
} from './graph-agent-controls.ts';
import { isSkippedEntry, matchOutgoing } from './graph-edges.ts';
import { type HandoffNodeSpec, prepareHandoff } from './graph-handoff.ts';
import {
  applyReducer,
  findBind,
  isPort,
  type MergeStateFn,
  resolveModelForPort,
  stateKeyOf,
} from './graph-helpers.ts';
import { executeMap, type MapNodeSpec, prepareMap } from './graph-map.ts';
import { mkEv, mkSnap, type SnapCtx } from './graph-snap.ts';
import {
  type ChildRunner,
  type DelegatedAskResume,
  executeSpawn,
  type PreparedSpawn,
  prepareSpawn,
  type SpawnNodeSpec,
  type SpawnResultItem,
} from './graph-spawn.ts';
import { applySteerMessages, type SteerMessage } from './graph-steer.ts';
import { prepareWait, type WaitNodeSpec } from './graph-wait.ts';
import {
  emitHook,
  type HookEmitCtx,
  hookContextText,
  hookRemindEffect,
  hookStopEffect,
  resolveHookCtx,
} from './hooks/emit-hook.ts';
import { type LlmResult, runLlmGenerate } from './llm.ts';
import {
  budgetNote,
  type LlmNote,
  type LlmNoteContext,
  type LlmNoteProvider,
  loopNote,
} from './llm-notes.ts';
import {
  createLoopGuardState,
  NUDGE_AFTER_IDENTICAL_CALLS,
  recordToolCall,
  STOP_AFTER_IDENTICAL_CALLS,
  toolCallSignature,
} from './loop-guard.ts';
import { enforceNudge } from './memory/enforce.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { printPackDiagnostics, selectPackOutputs } from './packs/pack-run.ts';
import { executeToolCall, type ToolCallResult } from './tool-call.ts';
import {
  buildToolMessage,
  collectUnansweredToolCalls,
  SYNTHETIC_TOOL_RESULT_ENDED,
  serializeToolResult,
  type ToolMessage,
  type UnansweredToolCall,
} from './tool-message.ts';
import { PERMISSION_RESUME_SCOPE_SCHEMA, sandboxDenyText } from './tool-permission.ts';

export type { MergeStateFn } from './graph-helpers.ts';

function positiveWindow(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function windowSource(
  value: unknown,
): { context_length?: number; top_provider?: { context_length?: number } } | undefined {
  if (value && typeof value === 'object') {
    return value as { context_length?: number; top_provider?: { context_length?: number } };
  }
  return undefined;
}

function hasHost(value: unknown): value is { host?: unknown } {
  return typeof value === 'object' && value !== null && 'host' in value;
}

function effectiveModelWindow(binding: ModelBinding): number | undefined {
  const m = binding.model;
  const model = positiveWindow(m.context_length) ?? positiveWindow(m.top_provider?.context_length);
  const host = hasHost(m) ? windowSource(m.host) : undefined;
  const hostModel =
    positiveWindow(host?.context_length) ?? positiveWindow(host?.top_provider?.context_length);
  return model ?? hostModel;
}

function isApprovedFalse(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      (
        payload as {
          approved?: unknown;
        }
      ).approved === false,
  );
}
function compactionFailNote(error: string): LlmNote {
  return {
    tag: 'compaction',
    text: `Compaction failed: ${error}. Continue work with the current context; it will retry on a later step.`,
  };
}
function contextPressureNote(): LlmNote {
  return {
    tag: 'compaction',
    text:
      'Context is almost full. Wrap up soon: finish the current task, avoid starting new ' +
      'subtasks, and persist important facts and decisions to memory or the plan now.',
  };
}
function compactionSkipNote(reason: CompactionSkipReason): LlmNote {
  if (reason === 'near-threshold') {
    return {
      tag: 'compaction',
      text:
        'Context is approaching the compaction threshold. This conversation may be summarized ' +
        'and compressed soon: persist any important facts and decisions to memory or the plan now.',
    };
  }
  if (reason === 'invalid-output-reserve') {
    return {
      tag: 'compaction',
      text:
        'Compaction is disabled: Max tokens reach the model context window. ' +
        'Lower "Max tokens" in the agent model settings.',
    };
  }
  return {
    tag: 'compaction',
    text:
      'Compaction is disabled: the context window of this model is unknown. ' +
      'Set the context window in the provider catalog or in the agent compaction settings.',
  };
}
interface BudgetResume {
  extend?: number;
  close?: boolean;
}
function budgetResumeOf(payload: unknown): BudgetResume {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const rec = payload as {
    extend?: unknown;
    close?: unknown;
  };
  const out: BudgetResume = {};
  if (typeof rec.extend === 'number' && Number.isFinite(rec.extend) && rec.extend >= 1) {
    out.extend = Math.floor(rec.extend);
  }
  if (rec.close === true) {
    out.close = true;
  }
  return out;
}
function presentedToolMessage(messages: unknown, toolCallId: string): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i] as Record<string, unknown> | null | undefined;
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (item.role !== 'tool' || item.toolCallId !== toolCallId) {
      continue;
    }
    return typeof item.content === 'string' ? item.content : undefined;
  }
  return undefined;
}
function repairDanglingToolCalls(messages: unknown[]): UnansweredToolCall[] {
  const dangling = collectUnansweredToolCalls(messages);
  if (dangling.length === 0) {
    return [];
  }
  const fixed: ToolMessage[] = dangling.map((c) =>
    buildToolMessage({
      toolCallId: c.toolCallId,
      name: c.name,
      content: SYNTHETIC_TOOL_RESULT_ENDED,
    }),
  );
  messages.push(...fixed);
  return dangling;
}
function normalizeInputAttachments(input: unknown): {
  text?: string;
  attachments?: Attachment[];
  origin?: string;
} {
  if (typeof input === 'string') {
    return input ? { text: input } : {};
  }
  if (!input || typeof input !== 'object') {
    return {};
  }
  const rec = input as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text : undefined;
  const origin = typeof rec.origin === 'string' ? rec.origin : undefined;
  const atts: Attachment[] = [];
  const seenPaths = new Set<string>();
  if (Array.isArray(rec.attachments)) {
    for (const a of rec.attachments as Record<string, unknown>[]) {
      const k = a.kind as AttachmentKind;
      if (k === 'image' || k === 'audio' || k === 'video' || k === 'file') {
        const path = typeof a.path === 'string' ? a.path : '';
        if (path) {
          seenPaths.add(path);
        }
        atts.push({
          id: typeof a.id === 'string' ? a.id : crypto.randomUUID(),
          kind: k,
          name: typeof a.name === 'string' ? a.name : 'file',
          mediaType: typeof a.mediaType === 'string' ? a.mediaType : '',
          path,
        });
      }
    }
  }
  const pushFiles = (arr: unknown, kind: AttachmentKind) => {
    if (!Array.isArray(arr)) {
      return;
    }
    for (const f of arr as Record<string, unknown>[]) {
      const p = typeof f.path === 'string' ? f.path : '';
      if (!p || seenPaths.has(p)) {
        continue;
      }
      seenPaths.add(p);
      atts.push({
        id: crypto.randomUUID(),
        kind,
        name: typeof f.name === 'string' && f.name ? f.name : (p.split(/[\\/]/).at(-1) ?? 'file'),
        mediaType: typeof f.mediaType === 'string' ? f.mediaType : '',
        path: p,
      });
    }
  };
  pushFiles(rec.images, 'image');
  pushFiles(rec.audio, 'audio');
  pushFiles(rec.video, 'video');
  pushFiles(rec.files, 'file');
  return {
    text: text || undefined,
    attachments: atts.length > 0 ? atts : undefined,
    origin: origin || undefined,
  };
}
export interface GraphOpts {
  agent: AgentDefinition;
  steerMessages?: () => Promise<SteerMessage[]>;
  ackSteerMessages?: (itemIds: string[]) => Promise<void>;
  input: unknown;
  state: RuntimeState;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  plan: Plan;
  toolMessages: 'barrier' | 'ordered';
  mergeState?: MergeStateFn;
  signal?: AbortSignal;
  resumePayload?: unknown;
  resumeInterruptId?: string;
  resumeNote?: string;
  startNodeId?: string;
  outputHint?: unknown;
  notes?: LlmNoteProvider[];
  packOutputs?: PackRunMap;
  capabilitySet?: CapabilitySet;
  universe?: CapabilityUniverse;
  skills?: SkillRegistry;
  env?: Record<string, string>;
  hooks?: HookEmitCtx;
  rejected?: boolean;
  inputRecorded?: boolean;
  stream?: {
    chunkIntervalMs?: number;
    chunkSize?: number;
  };
  agents: AgentsResolve;
  childJournal?: (spawnId: string, ev: Event) => void;
  childRunner?: ChildRunner;
  placement?: NodePlacement;
  sandbox?: boolean;
  mapContext?: {
    item: unknown;
    index: number;
  };
  logger?: Logger;
  channelNote?: string;
  process?: ProcessJobTarget;
  fileAccess?: FileAccessPolicy;
  fileAccessFor?: (agent: AgentDefinition) => FileAccessPolicy;
  spawnPath?: string;
  runtime?: RuntimePromptInfo;
}
function graphSlots(
  opts: GraphOpts,
  st: Record<string, unknown>,
  input: unknown,
  output: unknown,
): Slots {
  const slots: Slots = {
    input,
    state: st,
    output,
    resume: st.$resume ?? null,
  };
  if (opts.mapContext) {
    slots.item = opts.mapContext.item;
    slots.index = opts.mapContext.index;
  }
  return slots;
}
async function resolveFallbackBindings(
  agent: AgentDefinition,
  models: ProviderConfig[] | ModelsPort,
): Promise<ModelBinding[]> {
  const fallbacks = agent.fallback;
  if (!fallbacks || fallbacks.length === 0) {
    return [];
  }
  const bindings: ModelBinding[] = [];
  for (const ref of fallbacks) {
    if (isPort(models)) {
      const coords = resolveModelForPort(ref, agent);
      if (!coords) {
        continue;
      }
      try {
        bindings.push(await (models as ModelsPort).get(coords.provider, coords.model));
      } catch {}
    } else {
      const result = findBind(models as ProviderConfig[], ref, agent);
      if (result?.binding) {
        bindings.push(result.binding);
      }
    }
  }
  return bindings;
}
export async function* startGraph(opts: GraphOpts): AsyncIterable<Event> {
  let agent = opts.agent;
  let plan = opts.plan;
  let input = opts.input;
  let toolRegistry = opts.toolRegistry;
  let inputRecorded = opts.inputRecorded === true;
  let caps = selectPackOutputs(agent, opts.packOutputs ?? new Map());
  printPackDiagnostics(caps.diagnostics, opts.logger);
  const loaded = await opts.state.load();
  const runId = loaded?.runId ?? crypto.randomUUID();
  const excludedMediaRelPaths = new Map<string, { reason: string; untilTurn: number }>();
  let seq = loaded?.sequence ?? 0;
  const st: Record<string, unknown> = loaded
    ? { ...(loaded.state as Record<string, unknown>) }
    : {};
  if (!loaded && agent.state?.initial) {
    const sl0 = { input, state: {} as Record<string, unknown>, output: null, resume: null };
    for (const [k, v] of Object.entries(agent.state.initial)) {
      if (typeof v === 'string' && v.trim().startsWith('$')) {
        st[k] = evalExpr(v, sl0);
      } else {
        st[k] = v as unknown;
      }
    }
  }
  const startId = Object.entries(plan.nodes).find(([, n]) => n.type === 'core:start')?.[0];
  if (!startId) {
    throw Object.assign(new Error('missing start'), { code: 'start_count' });
  }
  let cur = startId;
  const isResumable = loaded?.status === 'needs_input' || loaded?.status === 'running';
  if (isResumable && loaded?.cursor) {
    const curAny = loaded.cursor as {
      currentNodeId?: string;
      nodes?: Record<
        string,
        {
          phase: string;
        }
      >;
    };
    if (typeof curAny.currentNodeId === 'string') {
      cur = curAny.currentNodeId;
    } else if (curAny.nodes) {
      const e = Object.entries(curAny.nodes).find(([, v]) => v.phase === 'executing');
      if (e) {
        cur = e[0];
      }
    }
  }
  let entryPending = false;
  let entryResumeActive = false;
  let compactionNote: LlmNote | undefined;
  let pressureNoted = false;
  const loopGuard = createLoopGuardState();
  if (opts.startNodeId && (opts.resumePayload !== undefined || opts.rejected === true)) {
    cur = opts.startNodeId;
    if (opts.rejected) {
      delete st.$resume;
    } else {
      st.$resume = opts.resumePayload;
    }
    entryPending = true;
  }
  const interruptSource = loaded?.cursor?.interrupt?.source;
  let output: unknown = opts.startNodeId === undefined ? null : (opts.outputHint ?? null);
  const hooks = resolveHookCtx(opts.hooks, {
    sessionId: opts.state.sessionId,
    runId,
    agentId: agent.id,
    threadId: opts.state.sessionId,
    cwd: opts.paths?.cwd ?? '',
  });
  const hookNotes: LlmNote[] = [];
  const sessionStart = await emitHook(hooks, 'SessionStart', {
    source: isResumable ? 'resume' : 'startup',
  });
  const sessionStartContext = hookContextText(sessionStart);
  if (sessionStartContext !== undefined) {
    hookNotes.push({ tag: 'hooks', text: sessionStartContext });
  }
  let steps = isResumable ? (loaded?.cursor?.budget?.steps ?? 0) : 0;
  let tokens = isResumable ? (loaded?.cursor?.budget?.tokens ?? 0) : 0;
  const t0 = isResumable ? (loaded?.cursor?.budget?.startedAt ?? Date.now()) : Date.now();
  let stops = isResumable ? (loaded?.cursor?.budget?.stops ?? 0) : 0;
  let memoryWrites = isResumable ? (loaded?.cursor?.budget?.memoryWrites ?? 0) : 0;
  let nudges = isResumable ? (loaded?.cursor?.budget?.nudges ?? 0) : 0;
  let lastLlmNodeId: string | undefined;
  let extend: BudgetExtension | undefined = isResumable
    ? loaded?.cursor?.budget?.extend
    : undefined;
  let deadlineAt: number | undefined = isResumable ? loaded?.cursor?.budget?.deadlineAt : undefined;
  let lastMsg: string | undefined;
  const nodeSteps = new Map<string, number>();
  let agentJson = JSON.stringify(agent);
  let orderJson = JSON.stringify(plan.order);
  const ctx = (): SnapCtx => ({
    sessionId: opts.state.sessionId,
    runId,
    seq,
    agentJson,
    orderJson,
    input,
    state: st,
    cur,
    steps,
    tokens,
    startedAt: t0,
    nodeStep: nodeSteps.get(cur) ?? 0,
    stops,
    memoryWrites,
    nudges,
    extend,
    deadlineAt,
  });
  const commit = async (
    status: string,
    type: string,
    kind: 'recorded' | 'intent' = 'recorded',
    metadata?: Record<string, unknown>,
  ): Promise<Event> => {
    seq += 1;
    const ev: Event = { ...mkEv(ctx(), type), agentId: agent.id };
    if (metadata) {
      ev.metadata = { ...(ev.metadata as Record<string, unknown>), ...metadata };
    }
    await opts.state.commit({ ...mkSnap(ctx(), status), sequence: seq }, [ev], {
      kind,
      sequence: seq,
    });
    return ev;
  };
  function budgetState(): BudgetState {
    return {
      budget: agent.budget,
      steps,
      tokens,
      startedAt: t0,
      extend,
      deadlineAt,
    };
  }
  function overBudget(): BudgetOver | null {
    return budgetOver(budgetState(), Date.now());
  }
  async function budgetStop(over: BudgetOver): Promise<{ event: Event; stop: boolean }> {
    if (agent.budget?.closeOnExhaustion === true) {
      closingPhase = 'pending';
      return {
        event: await commit('running', 'budget.closing', 'recorded', {
          kind: over.kind,
          limit: over.limit,
          used: over.used,
        }),
        stop: false,
      };
    }
    const policy = opts.sandbox === true ? 'error' : (agent.budget?.policy ?? 'error');
    if (policy === 'ask') {
      stops += 1;
      const interruptId = budgetInterruptId(runId, cur, stops);
      const extendDefault = defaultExtension(budgetState(), over.kind);
      delete st.$resume;
      const resumeSchema = {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          reason: { type: 'string' },
          extend: { type: 'integer', minimum: 1 },
          close: { type: 'boolean' },
        },
      } as JsonSchema;
      const snap = mkSnap(ctx(), 'needs_input');
      snap.cursor.interrupt = {
        interruptId,
        reason: budgetReason(over),
        resumeSchema,
        nodeId: cur,
        source: 'budget',
        output,
        budgetKind: over.kind,
        budgetLimit: over.limit,
        budgetUsed: over.used,
        budgetExtendDefault: extendDefault,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), EVENT_TYPES.INTERRUPT_TRIGGERED), agentId: agent.id };
      ev.metadata = {
        interruptId,
        reason: budgetReason(over),
        resumeSchema,
        source: 'budget',
        kind: over.kind,
        limit: over.limit,
        used: over.used,
        extendDefault,
      };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      return { event: ev, stop: true };
    }
    return {
      event: await commit('budget_exceeded', 'run.failed', 'recorded', {
        code: 'budget_exceeded',
        kind: over.kind,
        limit: over.limit,
        used: over.used,
      }),
      stop: true,
    };
  }
  async function repairBeforeExit(): Promise<Event[]> {
    const msgs = st.messages;
    if (!Array.isArray(msgs)) {
      return [];
    }
    const out: Event[] = [];
    for (const dangling of repairDanglingToolCalls(msgs)) {
      out.push(
        await commit('running', 'tool.skipped', 'recorded', {
          toolCallId: dangling.toolCallId,
          name: dangling.name,
          output: 'run ended before tool execution; no result recorded',
        }),
      );
    }
    return out;
  }
  let closingArmed = false;
  let wrapSuppressions = 0;
  let closingPhase: 'none' | 'pending' | 'done' = 'none';
  let closingReport = '';
  function isSandboxWrap(): boolean {
    if (opts.sandbox !== true || wrapSuppressions >= 2) {
      return false;
    }
    if (Object.values(plan.nodes).every((n) => n.type !== 'llm:generate')) {
      return false;
    }
    wrapSuppressions += 1;
    closingArmed = true;
    return true;
  }
  function suppressBudgetStop(): boolean {
    if (closingPhase === 'pending') {
      return true;
    }
    return isSandboxWrap();
  }
  function wrapDue(): boolean {
    if (closingPhase === 'pending') {
      return true;
    }
    if (opts.sandbox !== true || agent.budget === undefined) {
      return false;
    }
    if (closingArmed) {
      return true;
    }
    const b = agent.budget;
    return b.maxSteps !== undefined && b.maxSteps - steps <= 1;
  }
  function budgetLeftForPrompt(): BudgetLeft | undefined {
    return budgetLeft(budgetState(), Date.now());
  }
  while (true) {
    entryResumeActive = false;
    if (opts.signal?.aborted) {
      for (const ev of await repairBeforeExit()) {
        yield ev;
      }
      if (opts.signal.reason === 'delegated_ask') {
        const paused = await commit('running', 'run.paused', 'recorded', {
          reason: 'delegated_ask',
        });
        yield paused;
        break;
      }
      const e = await commit('cancelled', 'run.cancelled');
      yield e;
      break;
    }
    const node = plan.nodes[cur] as Node | undefined;
    if (!node) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error(`unknown node ${cur}`), { code: 'no_matching_edge' });
    }
    const slots = graphSlots(opts, st, input, output);
    if (entryPending && cur === opts.startNodeId) {
      entryPending = false;
      entryResumeActive = true;
      if (
        interruptSource === 'budget' &&
        (opts.rejected === true || isApprovedFalse(opts.resumePayload))
      ) {
        const e = await commit('cancelled', 'run.cancelled', 'recorded', {
          reason: 'budget_exceeded',
        });
        yield e;
        break;
      }
      if (interruptSource === 'budget') {
        const kind = loaded?.cursor?.interrupt?.budgetKind ?? 'steps';
        const resume = budgetResumeOf(opts.resumePayload);
        if (resume.close) {
          closingPhase = 'pending';
          const e = await commit('running', 'budget.closing', 'recorded', { kind });
          yield e;
        } else {
          const amount = resume.extend ?? loaded?.cursor?.interrupt?.budgetExtendDefault ?? 1;
          const next = extendState(budgetState(), kind, amount, Date.now());
          extend = next.extend;
          deadlineAt = next.deadlineAt;
          const e = await commit('running', 'budget.extended', 'recorded', {
            kind,
            amount,
            limit: budgetLimitOf(next, kind),
            used: budgetUsedOf(next, kind, Date.now()),
          });
          yield e;
        }
      }
      if (isSkippedEntry(node.type, opts.rejected, interruptSource)) {
        st.$resume = opts.rejected ? null : opts.resumePayload;
        if (node.type === 'control:wait') {
          const timedOut =
            opts.resumePayload !== undefined &&
            typeof opts.resumePayload === 'object' &&
            opts.resumePayload !== null &&
            (
              opts.resumePayload as {
                timedOut?: unknown;
              }
            ).timedOut === true;
          clearQueuedWait(st);
          yield await commit('running', 'wait.resumed', 'recorded', {
            nodeId: cur,
            timedOut,
            source: interruptSource === 'timer' ? 'timer' : 'respond',
          });
        }
        const edgeSlots = graphSlots(opts, st, input, output);
        let nxt: string | undefined;
        try {
          nxt = matchOutgoing(plan.edgesByFrom.get(cur) ?? [], edgeSlots);
        } catch (err) {
          const e = await commit('failed', 'run.failed');
          yield e;
          throw err;
        }
        if (!nxt) {
          const e = await commit('failed', 'run.failed');
          yield e;
          throw Object.assign(new Error('no_matching_edge'), { code: 'no_matching_edge' });
        }
        cur = nxt;
        delete st.$resume;
        nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
        steps += 1;
        const over = overBudget();
        if (over && !suppressBudgetStop()) {
          const outcome = await budgetStop(over);
          yield outcome.event;
          if (outcome.stop) {
            break;
          }
        }
        continue;
      }
    }
    await emitHook(hooks, 'NodeStart', { node: { id: cur, type: node.type } });
    if (node.type === 'core:start') {
      output = { input };
      if (input && typeof input === 'object') {
        const inpAny = input as Record<string, unknown>;
        const msgKey = 'messages';
        const normalized = normalizeInputAttachments(input);
        const hasUserContent = Boolean(normalized.text || normalized.attachments);
        if (hasUserContent) {
          let arr = st[msgKey] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            const m = inpAny.messages;
            arr = Array.isArray(m) ? [...(m as unknown[])] : [];
            st[msgKey] = arr;
          }
          const content = normalized.text ?? '';
          const ups = await emitHook(hooks, 'UserPromptSubmit', { message: content });
          if (ups?.blocked) {
            const e = await commit('failed', 'run.failed', 'recorded', {
              code: 'user_prompt_blocked',
              message: ups.blocked.reason,
            });
            yield e;
            break;
          }
          const upsContext = hookContextText(ups);
          const hookPrefix = upsContext !== undefined ? `[hooks]\n${upsContext}\n\n` : '';
          const userMsg: Record<string, unknown> = {
            role: 'user',
            content: `${hookPrefix}${content}`,
          };
          if (normalized.attachments) {
            userMsg.attachments = normalized.attachments;
          }
          if (normalized.origin) {
            userMsg.origin = normalized.origin;
          }
          arr.push(userMsg);
          if (!inputRecorded) {
            const meta: Record<string, unknown> = {};
            if (normalized.text) {
              meta.text = normalized.text;
            }
            if (normalized.attachments) {
              meta.attachments = normalized.attachments;
            }
            if (normalized.origin) {
              meta.origin = normalized.origin;
            }
            const ue = await commit('running', 'user.message', 'recorded', meta);
            yield ue;
          }
        } else if (Array.isArray(inpAny.messages) && !Array.isArray(st[msgKey])) {
          st[msgKey] = [...(inpAny.messages as unknown[])];
        }
      } else if (typeof input === 'string' && input) {
        const msgKey = 'messages';
        let arr = st[msgKey] as unknown[] | undefined;
        if (!Array.isArray(arr)) {
          arr = [];
          st[msgKey] = arr;
        }
        const ups = await emitHook(hooks, 'UserPromptSubmit', { message: input });
        if (ups?.blocked) {
          const e = await commit('failed', 'run.failed', 'recorded', {
            code: 'user_prompt_blocked',
            message: ups.blocked.reason,
          });
          yield e;
          break;
        }
        const upsContext = hookContextText(ups);
        const hookPrefix = upsContext !== undefined ? `[hooks]\n${upsContext}\n\n` : '';
        arr.push({ role: 'user', content: `${hookPrefix}${input}` });
        if (!inputRecorded) {
          const ue = await commit('running', 'user.message', 'recorded', { text: input });
          yield ue;
        }
      }
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'core:end') {
      const msgsForRepair = st.messages;
      if (Array.isArray(msgsForRepair)) {
        for (const dangling of repairDanglingToolCalls(msgsForRepair)) {
          const ev = await commit('running', 'tool.skipped', 'recorded', {
            toolCallId: dangling.toolCallId,
            name: dangling.name,
            output: 'run ended before tool execution; no result recorded',
          });
          yield ev;
        }
      }
      const stopOutcome = await emitHook(hooks, 'Stop', {});
      const stopEffect = hookStopEffect(stopOutcome);
      if (stopEffect !== undefined) {
        const reason = stopEffect.reason ?? 'stopped by hook';
        const stopped = await commit('completed', 'run.completed', 'recorded', {
          text: reason,
          stoppedByHook: true,
        });
        yield stopped;
        break;
      }
      const policy = agent.memoryPolicy;
      const gate = enforceNudge({
        enforce: policy?.enforce ?? DEFAULT_MEMORY_POLICY.enforce,
        level: agent.level ?? '',
        closing: wrapDue(),
        memoryWrites,
        steps,
        nudges,
        minSteps: policy?.minSteps ?? DEFAULT_MEMORY_POLICY.minSteps,
        maxNudges: policy?.maxNudges ?? DEFAULT_MEMORY_POLICY.maxNudges,
      });
      if (gate && lastLlmNodeId !== undefined) {
        const remindText = hookRemindEffect(stopOutcome)?.text ?? MEMORY_REMIND_DEFAULT;
        const message: Record<string, unknown> = {
          role: 'user',
          content: `[memory]\n${remindText}`,
        };
        const msgs = st.messages;
        if (Array.isArray(msgs)) {
          msgs.push(message);
        } else {
          st.messages = [message];
        }
        nudges += 1;
        cur = lastLlmNodeId;
        continue;
      }
      let fin: unknown = output;
      if (typeof node.output === 'string') {
        try {
          fin = evalExpr(node.output, slots);
        } catch {
          fin = node.output;
        }
      } else if (node.output !== undefined) {
        fin = node.output;
      } else {
        const msgs = st.messages as unknown[] | undefined;
        if (Array.isArray(msgs) && msgs.length > 0) {
          fin = msgs[msgs.length - 1];
        }
      }
      output = fin;
      let doneText: string | undefined;
      if (typeof fin === 'object' && fin !== null && 'content' in fin) {
        doneText = String(
          (
            fin as {
              content: unknown;
            }
          ).content ?? '',
        );
      } else if (typeof fin === 'string') {
        doneText = fin;
      } else if (
        typeof (
          fin as {
            text?: unknown;
          }
        )?.text === 'string'
      ) {
        doneText = String(
          (
            fin as {
              text: unknown;
            }
          ).text,
        );
      }
      const e = await commit(
        'completed',
        'run.completed',
        'recorded',
        doneText ? { text: doneText } : undefined,
      );
      yield e;
      break;
    } else if (node.type === 'llm:generate') {
      lastLlmNodeId = cur;
      const ln = node as {
        type: 'llm:generate';
        prompt: string;
        messages?: string;
        tools?: string[];
        model?:
          | string
          | {
              provider: string;
              model: string;
            };
        output?: unknown;
      };
      yield* applySteerMessages({
        steer: opts.steerMessages,
        ack: opts.ackSteerMessages,
        st,
        commit,
      });
      if (ln.messages) {
        lastMsg = ln.messages;
      }
      let binding: ModelBinding | null = null;
      let fallbackBindings: ModelBinding[] = [];
      if (isPort(opts.models)) {
        const coords = resolveModelForPort(
          ln.model as
            | string
            | {
                provider: string;
                model: string;
              }
            | undefined,
          agent,
        );
        if (coords) {
          try {
            binding = await (opts.models as ModelsPort).get(coords.provider, coords.model);
          } catch {
            binding = null;
          }
        }
      } else {
        binding =
          findBind(opts.models as ProviderConfig[], ln.model as never, agent)?.binding ?? null;
      }
      fallbackBindings = await resolveFallbackBindings(agent, opts.models);
      if (!binding) {
        const e = await commit('failed', 'run.failed');
        yield e;
        throw Object.assign(new Error('model_unresolved'), { code: 'model_unresolved' });
      }
      if (
        effectiveModelWindow(binding) === undefined &&
        positiveWindow(agent.generation?.contextWindowTokens) === undefined
      ) {
        const e = await commit('failed', 'run.failed');
        yield e;
        throw Object.assign(
          new Error(
            `model ${binding.model.name} has no context window set; set it in project settings or agent generation override`,
          ),
          { code: 'model_context_window_missing' },
        );
      }
      for await (const ev of runSummaryPassIfDue({
        agent: agent,
        state: st,
        sessionId: opts.state.sessionId,
        binding,
        models: opts.models,
        toolRegistry: toolRegistry,
        paths: opts.paths,
        signal: opts.signal ?? new AbortController().signal,
        logger: opts.logger,
        hooks,
      })) {
        if (ev.type === 'completed') {
          const m = ev.message;
          compactionNote = undefined;
          const u = m.stats.usage as Record<string, unknown> | undefined;
          tokens +=
            typeof u?.totalTokens === 'number' && Number.isFinite(u.totalTokens)
              ? u.totalTokens
              : (typeof u?.inputTokens === 'number' ? u.inputTokens : 0) +
                (typeof u?.outputTokens === 'number' ? u.outputTokens : 0);
          const e = await commit('running', 'compaction.completed', 'recorded', {
            id: m.id,
            coveredFrom: m.coveredFrom,
            coveredUntil: m.coveredUntil,
            reason: m.reason,
            tokensBefore: m.stats.tokensBefore,
            tokensAfter: m.stats.tokensAfter,
            summary: m.content,
            ...(m.model ? { model: m.model } : {}),
          });
          yield e;
        } else if (ev.type === 'failed') {
          compactionNote = compactionFailNote(ev.error);
          const e = await commit('running', 'compaction.failed', 'recorded', { error: ev.error });
          yield e;
        } else if (ev.type === 'skipped') {
          compactionNote = compactionSkipNote(ev.reason);
        } else if (ev.type === 'pressure') {
          if (!pressureNoted) {
            compactionNote = contextPressureNote();
            pressureNoted = true;
          }
        } else if (PASSTHROUGH_MODEL_EVENTS.has(ev.type)) {
          yield {
            ...mkEv(ctx(), ev.type),
            metadata: ev.data as Record<string, unknown>,
            agentId: agent.id,
          };
        }
      }
      const bindingsToTry = [binding, ...fallbackBindings];
      let lastError: unknown;
      let res: LlmResult | undefined;
      let usedModel = '';
      let usedModelId = '';
      let startedAt = 0;
      for (let attempt = 0; attempt < bindingsToTry.length; attempt++) {
        const currentBinding = bindingsToTry[attempt];
        if (!currentBinding) {
          continue;
        }
        try {
          await commit('running', 'model.requested', 'recorded');
          usedModel = currentBinding.model.name;
          usedModelId = currentBinding.model.id ?? '';
          startedAt = Date.now();
          const notes: LlmNote[] = [];
          const wrap = wrapDue();
          const left = budgetLeftForPrompt();
          if (left) {
            notes.push(budgetNote(left, wrap));
          } else if (wrap) {
            notes.push(budgetNote({}, true));
          }
          if (hooks) {
            for (const eff of hooks.bus.drainDeferred()) {
              if (eff.kind === 'context') {
                hookNotes.push({ tag: 'hooks', text: eff.text });
              }
            }
          }
          notes.push(...hookNotes);
          if (compactionNote) {
            notes.push(compactionNote);
          }
          if (loopGuard.streak >= NUDGE_AFTER_IDENTICAL_CALLS) {
            notes.push(loopNote(loopGuard.tool, loopGuard.streak));
          }
          const notesErrors: string[] = [];
          if (opts.notes?.length || caps.enabled.length > 0) {
            const noteCtx: LlmNoteContext = {
              agentId: agent.id,
              runId,
              sessionId: opts.state.sessionId,
              nodeId: cur,
              steps,
              state: st,
              permissions: opts.permissions,
              userText: typeof input === 'string' ? input : undefined,
            };
            for (const provider of opts.notes ?? []) {
              try {
                notes.push(...(await provider(noteCtx)));
              } catch (e) {
                notesErrors.push(`${cur}: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            for (const c of caps.enabled) {
              for (const provider of c.notes) {
                try {
                  notes.push(...(await provider(noteCtx)));
                } catch (e) {
                  notesErrors.push(`${cur}: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          }
          const stream = runLlmGenerate(
            {
              type: 'llm:generate',
              prompt: ln.prompt,
              messages: ln.messages,
              tools: wrap ? [] : ln.tools,
              model: ln.model as never,
              output: ln.output,
            },
            {
              agent: agent,
              state: st,
              input,
              output,
              modelBinding: currentBinding,
              toolRegistry: toolRegistry,
              signal: opts.signal ?? new AbortController().signal,
              notes,
              notesErrors,
              packOutputs: caps.enabled,
              skills: opts.skills,
              paths: opts.paths,
              permissions: opts.permissions,
              hooks,
              steps,
              sessionId: opts.state.sessionId,
              runId,
              channelNote: opts.channelNote,
              runtime: opts.runtime,
              fileAccess: opts.fileAccess,
              excludedMediaRelPaths,
            },
          );
          for await (const event of stream) {
            if (PASSTHROUGH_MODEL_EVENTS.has(event.type)) {
              yield {
                ...mkEv(ctx(), event.type),
                metadata: event.data as Record<string, unknown>,
                agentId: agent.id,
              };
            } else if (event.type === 'model.chunk') {
              await commit(
                'running',
                'model.chunk',
                'recorded',
                event.data as Record<string, unknown>,
              );
            } else if (event.type === 'model.completed') {
              res = event.data as LlmResult;
            }
          }
          if (res) {
            lastError = undefined;
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError) {
        throw lastError;
      }
      if (!res) {
        throw Object.assign(new Error('model completed without result'), {
          code: 'model_completed_without_result',
        });
      }
      output = res;
      if (lastMsg) {
        const key = stateKeyOf(lastMsg);
        if (key) {
          let arr = st[key] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            const inp = input as {
              messages?: unknown;
            };
            arr = Array.isArray(inp?.messages) ? [...(inp.messages as unknown[])] : [];
            st[key] = arr;
          }
          arr.push({
            role: 'assistant',
            content: res.text ?? '',
            reasoning: res.reasoning,
            toolCalls: res.toolCalls,
            finishReason: res.finishReason,
            sources: res.sources,
            files: res.files,
            usage: res.usage,
          });
        }
      }
      if (res.usage && typeof res.usage === 'object') {
        const u = res.usage as Record<string, unknown>;
        const total =
          typeof u.totalTokens === 'number' && Number.isFinite(u.totalTokens)
            ? u.totalTokens
            : (typeof u.inputTokens === 'number' ? u.inputTokens : 0) +
              (typeof u.outputTokens === 'number' ? u.outputTokens : 0);
        tokens += total;
      }
      if (closingPhase === 'pending') {
        closingPhase = 'done';
        closingReport = res.text ?? '';
      }
      const completedMeta: Record<string, unknown> = {};
      if (usedModel) {
        completedMeta.model = usedModel;
      }
      if (usedModelId) {
        completedMeta.modelId = usedModelId;
      }
      completedMeta.agentId = agent.id;
      if (startedAt > 0) {
        completedMeta.durationMs = Date.now() - startedAt;
      }
      if (res.text) {
        completedMeta.text = res.text;
      }
      if (res.reasoning) {
        completedMeta.reasoning = res.reasoning;
      }
      if (res.usage) {
        completedMeta.usage = res.usage;
      }
      if (res.toolCalls) {
        completedMeta.toolCalls = res.toolCalls;
      }
      if (res.sources) {
        completedMeta.sources = res.sources;
      }
      if (res.files) {
        completedMeta.files = res.files;
      }
      completedMeta.finishReason = res.finishReason;
      const e = await commit('running', 'model.completed', 'recorded', completedMeta);
      yield e;
      if (res.finishReason === 'tool-calls') {
        await commit('running', 'tool.requested');
      }
    } else if (node.type === 'tool:call') {
      const tn = node as ToolCallFixed | ToolCallBatch;
      const planNodeTypes = collectPlanNodeTypes(plan.nodes);
      const needsIntent = (() => {
        const names: string[] = 'name' in tn && tn.name ? [tn.name] : [];
        return names.some((n) => {
          const def = toolRegistry.get(n);
          const se = def?.sideEffect;
          return se === 'financial' || se === 'destructive' || se === 'credentialed';
        });
      })();
      if (needsIntent) {
        await commit('running', 'tool.intent', 'intent');
      }
      let res: {
        results: ToolCallResult[];
      };
      const outputBeforeBarrier = new Proxy((output as Record<string, unknown>) ?? {}, {
        get(target, prop, receiver) {
          if (prop === 'results') {
            throw Object.assign(new Error('$output.results not available before barrier'), {
              code: 'output_not_ready',
            });
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      try {
        res = await executeToolCall(tn, {
          state: st,
          output: outputBeforeBarrier,
          input,
          resume: st.$resume ?? null,
          toolRegistry: toolRegistry,
          permissions: opts.permissions,
          paths: opts.paths,
          signal: opts.signal ?? new AbortController().signal,
          runId,
          nodeId: cur,
          nodeExecutionId: `${runId}:${cur}:${steps}`,
          sessionId: opts.state.sessionId,
          toolMessages: opts.toolMessages,
          messagesPath: lastMsg,
          resumePayload: entryResumeActive ? opts.resumePayload : undefined,
          resumeInterruptId: entryResumeActive ? opts.resumeInterruptId : undefined,
          resumeNote: entryResumeActive ? opts.resumeNote : undefined,
          resumeRejected: entryResumeActive ? opts.rejected === true : undefined,
          sandbox: opts.sandbox,
          planNodeTypes,
          toolOutput: agent.toolOutput,
          hooks,
          env: opts.env,
          agentId: agent.id,
          spawnPath: opts.spawnPath,
          process: opts.process,
          fileAccess: opts.fileAccess,
        });
      } catch (e) {
        if (e instanceof AskUserInterrupt) {
          const interruptId = e.interruptId ?? crypto.randomUUID();
          delete st.$resume;
          const snap = mkSnap(ctx(), 'needs_input');
          snap.cursor.interrupt = {
            interruptId,
            reason: e.prompt,
            resumeSchema: e.resumeSchema ?? {
              type: 'object',
              properties: {
                text: { type: 'string' },
                optionIds: { type: 'array', items: { type: 'string' } },
              },
            },
            nodeId: cur,
            source: e.source ?? 'ask_user',
            tool: e.tool,
            output,
          };
          seq += 1;
          const ev: Event = { ...mkEv(ctx(), EVENT_TYPES.INTERRUPT_TRIGGERED), agentId: agent.id };
          ev.metadata = {
            interruptId,
            reason: e.prompt,
            resumeSchema: e.resumeSchema,
            source: e.source ?? 'ask_user',
            tool: e.tool,
          };
          await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
          yield ev;
          break;
        }
        throw e;
      }
      applyAgentControlToolResults(res.results, st);
      output = { results: res.results };
      for (const r of res.results) {
        if (!r.skipped && !r.cancelled) {
          recordToolCall(loopGuard, r.name, toolCallSignature(r.name, r.input));
          const toolDef = toolRegistry.get(r.name);
          if (toolDef?.group === 'memory' && toolDef.sideEffect === 'write') {
            memoryWrites += 1;
          }
        }
        const outputStr = serializeToolResult(r.result);
        const meta: Record<string, unknown> = {
          toolCallId: r.id,
          name: r.name,
          output: outputStr,
        };
        const presented = presentedToolMessage(st.messages, r.id);
        if (presented !== undefined) {
          meta.message = presented;
        }
        const callInput = (() => {
          if ('name' in tn && typeof tn.name === 'string') {
            const fixed = tn as ToolCallFixed;
            if (r.id === `${runId}:${cur}:0`) {
              return fixed.args;
            }
          }
          return undefined;
        })();
        if (callInput !== undefined) {
          meta.input = callInput;
        }
        const e = await commit(
          'running',
          r.isError ? 'tool.failed' : 'tool.completed',
          'recorded',
          meta,
        );
        yield e;
      }
      if (res.results.length === 0) {
        const e = await commit('running', 'tool.completed');
        yield e;
      }
    } else if (node.type === 'control:assign') {
      const asn = node as {
        type: 'control:assign';
        patch: Record<string, unknown>;
      };
      const patched: string[] = [];
      for (const [k, v] of Object.entries(asn.patch)) {
        let ev: unknown = v;
        if (typeof v === 'string' && v.trim().startsWith('$')) {
          try {
            ev = evalExpr(v, slots);
          } catch {
            ev = v;
          }
        } else if (typeof v === 'string' && v.includes('{$')) {
          ev = v.replace(/\{\$[^}]+\}/g, (m) => {
            try {
              return String(evalExpr(m.slice(1, -1), slots));
            } catch {
              return m;
            }
          });
        }
        st[k] = applyReducer(k, st[k], ev, {
          reducers: agent.state?.reducers,
          mergeState: opts.mergeState,
        });
        patched.push(k);
      }
      output = { patched };
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'control:goto') {
      const g = node as {
        type: 'control:goto';
        target: string;
      };
      let tgt: unknown;
      try {
        tgt = evalExpr(g.target, slots);
      } catch (e) {
        const ev = await commit('failed', 'run.failed');
        yield ev;
        throw Object.assign(new Error((e as Error).message), { code: 'goto_target_missing' });
      }
      if (typeof tgt !== 'string' || !plan.nodes[tgt]) {
        const ev = await commit('failed', 'run.failed');
        yield ev;
        throw Object.assign(new Error('goto_target_missing'), { code: 'goto_target_missing' });
      }
      cur = tgt;
      nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
      steps += 1;
      const over = overBudget();
      if (over && !suppressBudgetStop()) {
        const outcome = await budgetStop(over);
        yield outcome.event;
        if (outcome.stop) {
          break;
        }
      }
      continue;
    } else if (node.type === 'control:interrupt') {
      const ir = node as {
        type: 'control:interrupt';
        reason: string;
        resumeSchema: JsonSchema;
      };
      if (opts.sandbox) {
        const message = sandboxDenyText('interrupt', 'user input');
        const e = await commit('failed', 'run.failed', 'recorded', {
          code: 'sandbox_blocked',
          message,
        });
        yield e;
        throw Object.assign(new Error(message), { code: 'sandbox_blocked' });
      }
      const interruptId = crypto.randomUUID();
      delete st.$resume;
      const snap = mkSnap(ctx(), 'needs_input');
      snap.cursor.interrupt = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
        nodeId: cur,
        source: 'interrupt',
        output,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), EVENT_TYPES.INTERRUPT_TRIGGERED), agentId: agent.id };
      ev.metadata = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
      };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      yield ev;
      break;
    } else if (node.type === 'control:spawn') {
      const cpRaw = st[STATE_SPAWN_RESULTS_KEY];
      const checkpoint: SpawnResultItem[] = Array.isArray(cpRaw)
        ? (cpRaw as SpawnResultItem[])
        : [];
      let childResume: DelegatedAskResume | undefined;
      const delegatedMeta = loaded?.cursor?.interrupt?.delegated;
      const resumeRec =
        entryResumeActive && opts.resumePayload && typeof opts.resumePayload === 'object'
          ? (opts.resumePayload as { approved?: unknown; scope?: unknown })
          : undefined;
      if (
        delegatedMeta &&
        typeof delegatedMeta.spawnId === 'string' &&
        typeof delegatedMeta.childInterruptId === 'string' &&
        typeof delegatedMeta.childNodeId === 'string' &&
        resumeRec &&
        typeof resumeRec.approved === 'boolean'
      ) {
        childResume = {
          spawnId: delegatedMeta.spawnId,
          childInterruptId: delegatedMeta.childInterruptId,
          childNodeId: delegatedMeta.childNodeId,
          approved: resumeRec.approved,
          scope:
            resumeRec.scope === 'once' || resumeRec.scope === 'always' ? resumeRec.scope : 'run',
        };
      }
      let spawnOutcome: Awaited<ReturnType<typeof executeSpawn>>;
      let prepared: PreparedSpawn;
      try {
        prepared = prepareSpawn(
          node as SpawnNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
          checkpoint,
          budgetRemainder(budgetState(), Date.now()),
        );
        for (const d of prepared.denied) {
          const e = await commit('running', 'agent.failed', 'recorded', {
            agentId: d.agentId,
            spawnId: d.spawnId,
            code: d.error.code,
            message: d.error.message,
          });
          yield e;
        }
        for (const t of prepared.targets) {
          const e = await commit('running', 'agent.spawned', 'recorded', {
            agentId: t.call.agentId,
            spawnId: t.spawnId,
            taskInput: t.call.input,
            ...(t.quota?.maxSteps === undefined ? {} : { quotaSteps: t.quota.maxSteps }),
          });
          yield e;
        }
        const carried = prepared.carried.slice();
        const pending: Event[] = [];
        let wake: () => void = () => {};
        let commitTail: Promise<void> = Promise.resolve();
        const note = (ev: Event): void => {
          pending.push(ev);
          wake();
        };
        const spawnPromise = executeSpawn(
          prepared,
          { ...opts, agent, plan, input, toolRegistry, hooks },
          opts.childRunner ?? startGraph,
          (item) => {
            commitTail = commitTail.then(async () => {
              carried.push(item);
              st[STATE_SPAWN_RESULTS_KEY] = carried.slice();
              const ev = await commit(
                'running',
                item.error ? 'agent.failed' : 'agent.completed',
                'recorded',
                {
                  agentId: item.agentId,
                  spawnId: item.spawnId,
                  ...(item.error ? { code: item.error.code, message: item.error.message } : {}),
                },
              );
              note(ev);
            });
            return commitTail;
          },
          childResume,
        );
        let spawnSettled = false;
        let spawnError: unknown;
        void spawnPromise.then(
          () => {
            spawnSettled = true;
            wake();
          },
          (err) => {
            spawnSettled = true;
            spawnError = err;
            wake();
          },
        );
        while (!spawnSettled || pending.length > 0) {
          while (pending.length > 0) {
            yield pending.shift() as Event;
          }
          if (!spawnSettled) {
            await new Promise<void>((r) => {
              wake = r;
            });
          }
        }
        if (spawnError !== undefined) {
          throw spawnError;
        }
        spawnOutcome = await spawnPromise;
        delete st.$resume;
      } catch (err) {
        if (err instanceof DelegatedPermissionAsk) {
          const interruptId = `perm/${runId}:${cur}:${steps}/0`;
          delete st.$resume;
          const snap = mkSnap(ctx(), 'needs_input');
          snap.cursor.interrupt = {
            interruptId,
            reason: err.prompt,
            resumeSchema: PERMISSION_RESUME_SCOPE_SCHEMA,
            nodeId: cur,
            source: 'permission',
            output,
            delegated: {
              agentId: err.agentId,
              agentType: err.agentType,
              spawnId: err.spawnId,
              spawnPath: err.spawnPath,
              childInterruptId: err.childInterruptId,
              childNodeId: err.childNodeId,
            },
          };
          seq += 1;
          const ev: Event = { ...mkEv(ctx(), EVENT_TYPES.INTERRUPT_TRIGGERED), agentId: agent.id };
          ev.metadata = {
            interruptId,
            reason: err.prompt,
            source: 'permission',
            delegated: snap.cursor.interrupt.delegated,
          };
          await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
          yield ev;
          break;
        }
        const code =
          err &&
          typeof err === 'object' &&
          typeof (
            err as {
              code?: unknown;
            }
          ).code === 'string'
            ? (
                err as {
                  code: string;
                }
              ).code
            : 'spawn_failed';
        const message = err instanceof Error && err.message ? err.message : 'spawn failed';
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      output = [...prepared.denied, ...spawnOutcome.carried, ...spawnOutcome.results];
      appendSpawnResultsMessage(st, lastMsg, output);
      clearQueuedSpawns(st);
      delete st[STATE_SPAWN_RESULTS_KEY];
      const treeUsage = spawnOutcome.results.reduce(
        (acc, item) => ({
          steps: acc.steps + (item.usage?.steps ?? 0),
          tokens: acc.tokens + (item.usage?.tokens ?? 0),
        }),
        { steps: 0, tokens: 0 },
      );
      steps += treeUsage.steps;
      tokens += treeUsage.tokens;
      let spawnMeta: Record<string, unknown> | undefined;
      if (spawnOutcome.timedOut) {
        spawnMeta = { timedOut: true };
      } else if (treeUsage.steps > 0 || treeUsage.tokens > 0) {
        spawnMeta = { treeSteps: treeUsage.steps, treeTokens: treeUsage.tokens };
      }
      const e = await commit('running', 'node.completed', 'recorded', spawnMeta);
      yield e;
    } else if (node.type === 'control:handoff') {
      let prepared: ReturnType<typeof prepareHandoff>;
      try {
        prepared = prepareHandoff(
          node as HandoffNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
        );
      } catch (err) {
        const code =
          err &&
          typeof err === 'object' &&
          typeof (
            err as {
              code?: unknown;
            }
          ).code === 'string'
            ? (
                err as {
                  code: string;
                }
              ).code
            : 'handoff_target';
        const message = err instanceof Error && err.message ? err.message : 'handoff failed';
        clearQueuedHandoff(st);
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      yield await commit('running', prepared.emission.type, 'recorded', prepared.emission.metadata);
      agent = prepared.agent;
      plan = prepared.plan;
      input = prepared.input;
      toolRegistry = prepared.toolRegistry;
      inputRecorded = false;
      caps = selectPackOutputs(agent, opts.packOutputs ?? new Map());
      printPackDiagnostics(caps.diagnostics, opts.logger);
      agentJson = JSON.stringify(agent);
      orderJson = JSON.stringify(plan.order);
      output = { agentId: prepared.agent.id };
      clearQueuedHandoff(st);
      appendAssistantNote(
        st,
        lastMsg,
        'Thread handed off to you. You own the conversation from here.',
      );
      yield await commit('running', 'node.completed');
      cur = prepared.startNodeId;
      nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
      steps += 1;
      const overHandoff = overBudget();
      if (overHandoff && !suppressBudgetStop()) {
        const outcome = await budgetStop(overHandoff);
        yield outcome.event;
        if (outcome.stop) {
          break;
        }
      }
      continue;
    } else if (node.type === 'control:map') {
      try {
        const prepared = prepareMap(
          node as MapNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
          cur,
        );
        yield await commit('running', 'map.started', 'recorded', {
          nodeId: cur,
          count: prepared.items.length,
          concurrency: prepared.concurrency,
        });
        const mapIter = executeMap(
          prepared,
          { ...opts, agent, plan, input, toolRegistry, hooks },
          st,
          startGraph,
        );
        let mapStep = await mapIter.next();
        while (!mapStep.done) {
          yield await commit('running', mapStep.value.type, 'recorded', mapStep.value.metadata);
          mapStep = await mapIter.next();
        }
        const mapOutcome = mapStep.value;
        output = { results: mapOutcome.results };
        appendMapResultsMessage(st, lastMsg, mapOutcome.results);
        clearQueuedMap(st);
        yield await commit('running', 'map.completed', 'recorded', {
          nodeId: cur,
          ok: mapOutcome.results.filter((r) => !r.error).length,
          failed: mapOutcome.results.filter((r) => r.error).length,
          timedOut: mapOutcome.timedOut || undefined,
        });
      } catch (err) {
        clearQueuedMap(st);
        const code =
          err &&
          typeof err === 'object' &&
          typeof (
            err as {
              code?: unknown;
            }
          ).code === 'string'
            ? (
                err as {
                  code: string;
                }
              ).code
            : 'map_failed';
        const message = err instanceof Error && err.message ? err.message : 'map failed';
        if (code === 'map_timeout') {
          const e = await commit('timed_out', 'run.failed', 'recorded', { code, message });
          yield e;
          break;
        }
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
    } else if (node.type === 'control:wait') {
      if (opts.sandbox) {
        const message = sandboxDenyText('wait', 'user input');
        const e = await commit('failed', 'run.failed', 'recorded', {
          code: 'sandbox_blocked',
          message,
        });
        yield e;
        throw Object.assign(new Error(message), { code: 'sandbox_blocked' });
      }
      let preparedWait: ReturnType<typeof prepareWait>;
      try {
        preparedWait = prepareWait(node as WaitNodeSpec, slots);
      } catch (err) {
        const code =
          err &&
          typeof err === 'object' &&
          typeof (
            err as {
              code?: unknown;
            }
          ).code === 'string'
            ? (
                err as {
                  code: string;
                }
              ).code
            : 'wait_failed';
        const message = err instanceof Error && err.message ? err.message : 'wait failed';
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      delete st.$resume;
      const snap = mkSnap(ctx(), 'waiting');
      snap.cursor.interrupt = {
        interruptId: preparedWait.interruptId,
        reason: preparedWait.reason,
        resumeSchema: preparedWait.resumeSchema,
        nodeId: cur,
        source: preparedWait.source,
        output,
        waitMode: preparedWait.mode,
        onTimeout: preparedWait.onTimeout,
      };
      if (preparedWait.fireAt !== undefined) {
        snap.cursor.timers = [{ id: preparedWait.interruptId, fireAt: preparedWait.fireAt }];
      }
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'wait.started'), agentId: agent.id };
      ev.metadata = {
        interruptId: preparedWait.interruptId,
        reason: preparedWait.reason,
        resumeSchema: preparedWait.resumeSchema,
        source: preparedWait.source,
        mode: preparedWait.mode,
        fireAt: preparedWait.fireAt,
        onTimeout: preparedWait.onTimeout,
      };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      yield ev;
      break;
    } else if (node.type === 'control:yield') {
      const e = await commit('failed', 'run.failed', 'recorded', {
        code: 'yield_outside_map',
        message: 'control:yield is only valid inside control:map body',
      });
      yield e;
      throw Object.assign(new Error('yield_outside_map'), { code: 'yield_outside_map' });
    } else {
      const e = await commit('failed', 'run.failed', 'recorded', {
        code: 'node_unsupported',
        nodeType: node.type,
      });
      yield e;
      throw Object.assign(new Error(`unsupported node type: ${node.type}`), {
        code: 'node_unsupported',
      });
    }
    nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
    steps += 1;
    if (entryResumeActive) {
      delete st.$resume;
    }
    await emitHook(hooks, 'NodeEnd', { node: { id: cur, type: node.type } });
    if (closingPhase === 'done') {
      const e = await commit('budget_exceeded', 'run.failed', 'recorded', {
        code: 'budget_exceeded',
        ...(closingReport === '' ? {} : { text: closingReport }),
      });
      yield e;
      break;
    }
    const over = overBudget();
    if (over && !suppressBudgetStop()) {
      const closing = agent.budget?.closeOnExhaustion === true;
      if (!closing) {
        for (const ev of await repairBeforeExit()) {
          yield ev;
        }
      }
      const outcome = await budgetStop(over);
      yield outcome.event;
      if (outcome.stop) {
        break;
      }
    }
    if (loopGuard.streak >= STOP_AFTER_IDENTICAL_CALLS) {
      yield await commit('failed', 'loop.exceeded', 'recorded', {
        tool: loopGuard.tool,
        repeats: loopGuard.streak,
        signature: loopGuard.signature,
      });
      yield await commit('failed', 'run.failed', 'recorded', {
        code: 'loop_exceeded',
        message: `tool "${loopGuard.tool}" was called with identical arguments ${loopGuard.streak} times in a row`,
      });
      break;
    }
    const edgeSlots = graphSlots(opts, st, input, output);
    let nxt: string | undefined;
    try {
      nxt = matchOutgoing(plan.edgesByFrom.get(cur) ?? [], edgeSlots);
    } catch (err) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw err;
    }
    if (!nxt) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error('no_matching_edge'), { code: 'no_matching_edge' });
    }
    cur = nxt;
    delete st.$resume;
  }
}
