import type { StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { AgentDefinition, AgentModelRef, PortRef } from '../../domain/agent-definition.ts';
import {
  type CompactionBudget,
  type CompactionMessage,
  DEFAULT_COMPACTION_FAILURE_LIMIT,
  DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS,
  DEFAULT_COMPACTION_RAPID_REFILL_STEPS,
  isCompactionMessage,
  type ParsedCompactionSpec,
  parseThresholdSpec,
  resolveCompactionBudget,
  THRESHOLD_SUMMARY_NAME,
} from '../../domain/compaction.ts';
import { CONSOLE_LOGGER, type Logger } from '../../ports/logger.ts';
import type { ModelQuotaPort } from '../../ports/model-quota.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../../ports/models.ts';
import type { PathsConfig } from '../../ports/paths.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { findBind, isPort, resolveModelForPort } from '../graph-helpers.ts';
import { emitHook, type HookEmitCtx, hookBlockedReason } from '../hooks/emit-hook.ts';
import { projectCompacted, projectedForEstimate } from '../llm.ts';
import { resolveCoveredBoundary } from './cursor.ts';
import { estimateTokens, estimateTokensAnchored, type TokenEstimate } from './estimate.ts';
import { writeCompactionFile } from './file-log.ts';
import { microcompactToolResults } from './microcompact.ts';
import { extendCutToToolResults, planCut, protectedWindowCount } from './plan-cut.ts';
import { priorSummaryBlock, SUMMARY_SYSTEM_PROMPT, streamSummary } from './summarize.ts';

const microcompactNotified = new WeakSet<object>();
export interface CompactionGuard {
  consecutiveFailures: number;
  completedSteps: number[];
}
export interface CompactionPassContext {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  sessionId: string;
  binding: ModelBinding;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  paths?: PathsConfig;
  signal: AbortSignal;
  logger?: Logger;
  hooks?: HookEmitCtx;
  guard?: CompactionGuard;
  step?: number;
  modelQuota?: ModelQuotaPort;
}
export type CompactionPassEvent =
  | {
      type: 'started';
      id: string;
      reason: 'threshold' | 'manual' | 'overflow';
      coveredFrom: number;
      coveredUntil: number;
    }
  | {
      type: 'completed';
      message: CompactionMessage;
    }
  | {
      type: 'failed';
      /** Present when the failure happened after the pass opened (see started). */
      id?: string;
      error: string;
    }
  | {
      type: 'skipped';
      reason: CompactionSkipReason;
    }
  | {
      type: 'pressure';
    }
  | {
      type: 'model.delta' | 'model.reasoning' | 'model.reasoning-start' | 'model.reasoning-end';
      data: unknown;
    };
export type CompactionSkipReason =
  | 'invalid-output-reserve'
  | 'near-threshold'
  | 'empty-history'
  | 'resume-pending'
  | 'already-covered'
  | 'no-cut-plan'
  | 'hook-blocked'
  | 'empty-window'
  | 'breaker-open'
  | 'rapid-refill';
interface GuardLimits {
  failureLimit: number;
  rapidRefillSteps: number;
  rapidRefillMaxCompactions: number;
}
function guardLimitsOf(spec: ParsedCompactionSpec): GuardLimits {
  return {
    failureLimit: spec.compactionFailureLimit,
    rapidRefillSteps: spec.compactionRapidRefillSteps,
    rapidRefillMaxCompactions: spec.rapidRefillMaxCompactions,
  };
}
export function compactionGuardOpen(
  guard: CompactionGuard | undefined,
  step: number,
  limits: GuardLimits = {
    failureLimit: DEFAULT_COMPACTION_FAILURE_LIMIT,
    rapidRefillSteps: DEFAULT_COMPACTION_RAPID_REFILL_STEPS,
    rapidRefillMaxCompactions: DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS,
  },
): CompactionSkipReason | null {
  if (!guard) {
    return null;
  }
  if (limits.failureLimit > 0 && guard.consecutiveFailures >= limits.failureLimit) {
    return 'breaker-open';
  }
  if (limits.rapidRefillSteps > 0 && limits.rapidRefillMaxCompactions > 0) {
    const recent = guard.completedSteps.filter((s) => step - s <= limits.rapidRefillSteps).length;
    if (recent >= limits.rapidRefillMaxCompactions) {
      return 'rapid-refill';
    }
  }
  return null;
}
function findAnchorIndex(messages: readonly unknown[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCompactionMessage(messages[i])) {
      return i;
    }
  }
  return -1;
}
function toolsJsonOf(registry: Map<string, ToolDefinition>): string {
  return JSON.stringify(
    [...registry.values()].map((t) => ({ name: t.name, description: t.description })),
  );
}
function estimateOf(
  ctx: CompactionPassContext,
  messages: readonly unknown[],
  toolsJson: string,
): TokenEstimate {
  const projected = projectedForEstimate(projectCompacted(messages as unknown[]));
  if (ctx.agent.generation?.context?.usageAnchor === false) {
    return estimateTokens(projected, toolsJson, { model: ctx.binding.model });
  }
  return estimateTokensAnchored(projected, toolsJson, { model: ctx.binding.model });
}
function contextWindowOf(binding: ModelBinding): number | undefined {
  const window = binding.model.context_length ?? binding.model.top_provider?.context_length;
  return positiveInt(window);
}
function maxOutputOf(binding: ModelBinding): number | undefined {
  return positiveInt(binding.model.top_provider?.max_completion_tokens);
}
function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function effectiveContextWindow(ctx: CompactionPassContext): number | undefined {
  const modelWindow = contextWindowOf(ctx.binding);
  const override = positiveInt(ctx.agent.generation?.contextWindowTokens);
  if (override && modelWindow) {
    return Math.min(override, modelWindow);
  }
  return override ?? modelWindow;
}

async function compactionWindowOf(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
): Promise<number | undefined> {
  const agentWindow = effectiveContextWindow(ctx);
  if (!spec.summaryModel) {
    return agentWindow;
  }
  let summaryWindow: number | undefined;
  try {
    summaryWindow = contextWindowOf(await resolveSummaryBinding(ctx, spec.summaryModel));
  } catch {
    // sizing falls back to the agent window; the actual call reports the failure
  }
  if (!summaryWindow) {
    return agentWindow;
  }
  return agentWindow ? Math.min(agentWindow, summaryWindow) : summaryWindow;
}

function effectiveOutputReserve(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
  contextLength: number,
): number {
  const reserve = positiveInt(ctx.agent.generation?.maxTokens) ?? maxOutputOf(ctx.binding) ?? 0;
  const cap = Math.floor(contextLength * spec.outputReserveRatio);
  return Math.min(reserve, contextLength, cap);
}

async function compactionBudgetOf(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
): Promise<CompactionBudget> {
  const window = await compactionWindowOf(ctx, spec);
  const reserve = window ? effectiveOutputReserve(ctx, spec, window) : 0;
  return resolveCompactionBudget(spec, window, reserve);
}

function nearThresholdFrom(threshold: number, gap: number): number {
  return Math.floor(threshold * (1 - gap));
}
async function resolveSummaryBinding(
  ctx: CompactionPassContext,
  ref: AgentModelRef,
): Promise<ModelBinding> {
  if (isPort(ctx.models)) {
    const coords = resolveModelForPort(ref, ctx.agent);
    if (coords) {
      return await (ctx.models as ModelsPort).get(coords.provider, coords.model);
    }
  } else {
    const result = findBind(ctx.models as ProviderConfig[], ref, ctx.agent);
    if (result?.binding) {
      return result.binding;
    }
  }
  throw new Error(`summary model not found: ${ref.provider}/${ref.model}`);
}
async function* passIfDue(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
  reason: 'threshold' | 'manual' | 'overflow',
): AsyncGenerator<CompactionPassEvent> {
  const messages = Array.isArray(ctx.state.messages) ? (ctx.state.messages as unknown[]) : null;
  if (!messages || messages.length === 0) {
    yield { type: 'skipped', reason: 'empty-history' };
    return;
  }
  if (ctx.state.$resume !== undefined) {
    yield { type: 'skipped', reason: 'resume-pending' };
    return;
  }
  const toolsJson = toolsJsonOf(ctx.toolRegistry);
  const before = estimateOf(ctx, messages, toolsJson);
  const budget = await compactionBudgetOf(ctx, spec);
  if (reason === 'threshold') {
    if (budget.exhausted) {
      yield { type: 'skipped', reason: 'invalid-output-reserve' };
      return;
    }
    if (before.total < budget.threshold) {
      const warnFrom = nearThresholdFrom(budget.threshold, spec.preThresholdGapRatio);
      if (spec.preCompactNote && warnFrom > 0 && before.total >= warnFrom) {
        yield { type: 'skipped', reason: 'near-threshold' };
      }
      return;
    }
  }
  const anchorIndex = findAnchorIndex(messages);
  const anchor = anchorIndex >= 0 ? (messages[anchorIndex] as CompactionMessage) : undefined;
  const afterIndex = anchor ? anchor.coveredUntil : -1;
  if (afterIndex >= messages.length - 1) {
    yield { type: 'skipped', reason: 'already-covered' };
    return;
  }
  const protectMessages =
    spec.protectRecentTurns > 0 ? protectedWindowCount(messages, spec.protectRecentTurns) : 0;
  const plan = planCut(messages, {
    protectTokens: budget.protectTokens,
    ...(protectMessages > 0 ? { protectMessages } : {}),
    afterIndex,
  });
  if (!plan) {
    yield { type: 'skipped', reason: 'no-cut-plan' };
    return;
  }
  plan.coveredUntil = extendCutToToolResults(messages, plan.coveredUntil);
  const pre = await emitHook(ctx.hooks, 'PreCompact', {
    trigger: reason === 'manual' ? 'manual' : 'auto',
  });
  if (hookBlockedReason(pre) !== undefined) {
    yield { type: 'skipped', reason: 'hook-blocked' };
    return;
  }
  yield* writeCompactionMessage(ctx, {
    spec,
    reason,
    plan,
    anchorIndex,
    anchor,
    toolsJson,
    before,
  });
}
interface WriteArgs {
  spec: ParsedCompactionSpec;
  reason: 'threshold' | 'manual' | 'overflow';
  plan: {
    coveredFrom: number;
    coveredUntil: number;
  };
  anchorIndex: number;
  anchor?: CompactionMessage;
  toolsJson: string;
  before: {
    messages: number;
    tools: number;
    total: number;
  };
}
async function* writeCompactionMessage(
  ctx: CompactionPassContext,
  args: WriteArgs,
): AsyncGenerator<CompactionPassEvent> {
  const messages = ctx.state.messages as unknown[];
  let binding = ctx.binding;
  if (args.spec.summaryModel) {
    try {
      binding = await resolveSummaryBinding(ctx, args.spec.summaryModel);
    } catch (e) {
      yield { type: 'failed', error: e instanceof Error ? e.message : String(e) };
      return;
    }
  }
  const from = args.anchor ? args.anchor.coveredUntil + 1 : 0;
  const head: unknown[] = [];
  for (let i = from; i <= args.plan.coveredUntil; i++) {
    if (i === args.anchorIndex) {
      continue;
    }
    head.push(messages[i]);
  }
  if (head.length === 0) {
    yield { type: 'skipped', reason: 'empty-window' };
    return;
  }
  const system = args.anchor
    ? `${SUMMARY_SYSTEM_PROMPT}${priorSummaryBlock(args.anchor.content)}`
    : SUMMARY_SYSTEM_PROMPT;
  const id = crypto.randomUUID();
  yield {
    type: 'started',
    id,
    reason: args.reason,
    coveredFrom: args.plan.coveredFrom,
    coveredUntil: args.plan.coveredUntil,
  };
  let completed:
    | Extract<
        StreamChunk,
        {
          type: 'completed';
        }
      >
    | undefined;
  try {
    for await (const ev of streamSummary({
      binding,
      system,
      head,
      signal: ctx.signal,
      sessionId: ctx.sessionId,
      rawRequestDir: ctx.paths?.threadDir,
      rawRequestMode: ctx.agent.observability?.rawRequests,
      modelQuota: ctx.modelQuota,
    })) {
      if (ev.type === 'summary.completed' && ev.result) {
        completed = ev.result as Extract<
          StreamChunk,
          {
            type: 'completed';
          }
        >;
      } else {
        yield { type: ev.type, data: ev.data } as CompactionPassEvent;
      }
    }
  } catch (e) {
    if (ctx.guard) {
      ctx.guard.consecutiveFailures += 1;
    }
    yield {
      type: 'failed',
      id,
      error: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  const text = completed && typeof completed.text === 'string' ? completed.text : '';
  if (completed?.finishReason !== 'stop' || !text.trim()) {
    if (ctx.guard) {
      ctx.guard.consecutiveFailures += 1;
    }
    yield {
      type: 'failed',
      id,
      error: `summary pass rejected: finishReason=${completed?.finishReason ?? 'none'}${text.trim() ? '' : ', empty text'}`,
    };
    return;
  }
  const boundary = resolveCoveredBoundary(messages, args.plan.coveredUntil);
  const boundaryFields: Partial<CompactionMessage> = {};
  if (boundary) {
    boundaryFields.coveredKind = boundary.kind;
    if (boundary.engSeq !== undefined) {
      boundaryFields.coveredUntilEngSeq = boundary.engSeq;
    } else if (boundary.runId !== undefined && boundary.seq !== undefined) {
      boundaryFields.coveredUntilRunId = boundary.runId;
      boundaryFields.coveredUntilSeq = boundary.seq;
    }
    if (boundary.toolCallId !== undefined) {
      boundaryFields.coveredToolCallId = boundary.toolCallId;
    }
  } else {
    boundaryFields.durable = false;
    boundaryFields.unresolvedReason = 'no-sourced-boundary';
  }
  const message: CompactionMessage = {
    role: 'assistant',
    kind: 'compaction',
    id,
    content: text,
    coveredFrom: args.plan.coveredFrom,
    coveredUntil: args.plan.coveredUntil,
    messageCount: messages.length,
    reason: args.reason,
    ...boundaryFields,
    stats: {
      tokensBefore: args.before.total,
      tokensAfter: 0,
      coveredCount: args.plan.coveredUntil - args.plan.coveredFrom + 1,
      usage: completed.usage,
    },
    model: { provider: binding.driver, model: binding.name },
    createdAt: new Date().toISOString(),
  };
  message.stats.tokensAfter = estimateTokens(
    projectedForEstimate(projectCompacted([...messages, message])),
    args.toolsJson,
    { model: ctx.binding.model },
  ).total;
  messages.push(message);
  if (ctx.guard) {
    ctx.guard.consecutiveFailures = 0;
    if (ctx.step !== undefined) {
      ctx.guard.completedSteps.push(ctx.step);
    }
  }
  try {
    await writeCompactionFile({
      paths: ctx.paths,
      sessionId: ctx.sessionId,
      message,
      modelLabel: binding.name,
    });
  } catch (e) {
    (ctx.logger ?? CONSOLE_LOGGER).warn(
      `[compaction] file log failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  await emitHook(ctx.hooks, 'PostCompact', {
    trigger: args.reason === 'manual' ? 'manual' : 'auto',
  });
  yield { type: 'completed', message };
}
export async function* runSummaryPassIfDue(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (ref && ref.name !== THRESHOLD_SUMMARY_NAME) {
    (ctx.logger ?? CONSOLE_LOGGER).warn(`[compaction] unknown compaction port: ${ref.name}`);
  }
  const spec =
    ref && ref.name === THRESHOLD_SUMMARY_NAME
      ? parseThresholdSpec(ref.spec)
      : parseThresholdSpec();
  const messages = ctx.state.messages;
  if (Array.isArray(messages) && spec.microcompact) {
    if (!microcompactNotified.has(ctx.state)) {
      microcompactNotified.add(ctx.state);
      (ctx.logger ?? CONSOLE_LOGGER).warn(
        `[compaction] microcompact is experimental: stepped window keep=${spec.microcompactKeepRounds} step=${spec.microcompactStepRounds}`,
      );
    }
    microcompactToolResults(messages as unknown[], {
      keepRounds: spec.microcompactKeepRounds,
      stepRounds: spec.microcompactStepRounds,
      minGainTokens: spec.microcompactMinGainTokens,
    });
  }
  if (spec.auto) {
    const open = compactionGuardOpen(ctx.guard, ctx.step ?? 0, guardLimitsOf(spec));
    if (!open) {
      let emitted = false;
      for await (const ev of passIfDue(ctx, spec, 'threshold')) {
        emitted = true;
        yield ev;
      }
      if (emitted) {
        return;
      }
    } else {
      yield { type: 'skipped', reason: open };
    }
  }
  yield* pressureEventIfDue(ctx, spec);
}
export async function* runForcedCompaction(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref || ref.name !== THRESHOLD_SUMMARY_NAME) {
    yield { type: 'failed', error: 'compaction is not configured' };
    return;
  }
  const spec = parseThresholdSpec(ref.spec);
  const open = compactionGuardOpen(ctx.guard, ctx.step ?? 0, guardLimitsOf(spec));
  if (open) {
    yield { type: 'skipped', reason: open };
    return;
  }
  let emitted = false;
  for await (const ev of passIfDue(ctx, spec, 'overflow')) {
    emitted = true;
    yield ev;
  }
  if (!emitted) {
    yield { type: 'failed', error: 'context overflow: forced compaction did not shrink history' };
  }
}

async function* pressureEventIfDue(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
): AsyncGenerator<CompactionPassEvent> {
  const messages = Array.isArray(ctx.state.messages) ? (ctx.state.messages as unknown[]) : null;
  if (!messages || messages.length === 0 || ctx.state.$resume !== undefined) {
    return;
  }
  const budget = await compactionBudgetOf(ctx, spec);
  if (budget.exhausted) {
    return;
  }
  const warnFrom = nearThresholdFrom(budget.threshold, spec.preThresholdGapRatio);
  if (warnFrom <= 0) {
    return;
  }
  const before = estimateOf(ctx, messages, toolsJsonOf(ctx.toolRegistry));
  if (before.total >= warnFrom) {
    yield { type: 'pressure' };
  }
}

export async function* compactForced(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref || ref.name !== THRESHOLD_SUMMARY_NAME) {
    throw Object.assign(new Error('compaction is not configured'), {
      code: 'compaction_not_configured',
    });
  }
  yield* passIfDue(ctx, parseThresholdSpec(ref.spec), 'manual');
}
