import type { StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { AgentDefinition, AgentModelRef, PortRef } from '../../domain/agent-definition.ts';
import {
  type CompactionMessage,
  isCompactionMessage,
  type ParsedCompactionSpec,
  parseThresholdSpec,
  THRESHOLD_SUMMARY_NAME,
} from '../../domain/compaction.ts';
import { CONSOLE_LOGGER, type Logger } from '../../ports/logger.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../../ports/models.ts';
import type { PathsConfig } from '../../ports/paths.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { findBind, isPort, resolveModelForPort } from '../graph-helpers.ts';
import { emitHook, type HookEmitCtx, hookBlockedReason } from '../hooks/emit-hook.ts';
import { projectCompacted, projectedForEstimate } from '../llm.ts';
import { estimateTokens } from './estimate.ts';
import { writeCompactionFile } from './file-log.ts';
import { planCut } from './plan-cut.ts';
import { priorSummaryBlock, SUMMARY_SYSTEM_PROMPT, streamSummary } from './summarize.ts';
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
}
export type CompactionPassEvent =
  | {
      type: 'completed';
      message: CompactionMessage;
    }
  | {
      type: 'failed';
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
  | 'no-context-window'
  | 'invalid-output-reserve'
  | 'near-threshold'
  | 'empty-history'
  | 'resume-pending'
  | 'already-covered'
  | 'no-cut-plan'
  | 'hook-blocked'
  | 'empty-window';
const PRE_THRESHOLD_GAP = 0.1;
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

function effectiveOutputReserve(ctx: CompactionPassContext, contextLength: number): number {
  const reserve = positiveInt(ctx.agent.generation?.maxTokens) ?? maxOutputOf(ctx.binding) ?? 0;
  return Math.min(reserve, contextLength);
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
  reason: 'threshold' | 'manual',
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
  const before = estimateTokens(projectedForEstimate(projectCompacted(messages)), toolsJson, {
    model: ctx.binding.model,
  });
  const contextLength = await compactionWindowOf(ctx, spec);
  if (!contextLength) {
    yield { type: 'skipped', reason: 'no-context-window' };
    return;
  }
  if (reason === 'threshold') {
    const available = contextLength - effectiveOutputReserve(ctx, contextLength);
    if (available <= 0) {
      yield { type: 'skipped', reason: 'invalid-output-reserve' };
      return;
    }
    if (before.total < available * spec.thresholdRatio) {
      const warnRatio = spec.thresholdRatio - PRE_THRESHOLD_GAP;
      if (spec.preCompactNote && warnRatio > 0 && before.total >= available * warnRatio) {
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
  const protectTokens =
    reason === 'manual' ? 0 : Math.floor(contextLength * spec.protectRecentRatio);
  const plan = planCut(messages, { protectTokens, afterIndex });
  if (!plan) {
    yield { type: 'skipped', reason: 'no-cut-plan' };
    return;
  }
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
  reason: 'threshold' | 'manual';
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
    yield {
      type: 'failed',
      error: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  const text = completed && typeof completed.text === 'string' ? completed.text : '';
  if (completed?.finishReason !== 'stop' || !text.trim()) {
    yield {
      type: 'failed',
      error: `summary pass rejected: finishReason=${completed?.finishReason ?? 'none'}${text.trim() ? '' : ', empty text'}`,
    };
    return;
  }
  const message: CompactionMessage = {
    role: 'assistant',
    kind: 'compaction',
    id: crypto.randomUUID(),
    content: text,
    coveredFrom: args.plan.coveredFrom,
    coveredUntil: args.plan.coveredUntil,
    reason: args.reason,
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
  if (spec.auto) {
    let emitted = false;
    for await (const ev of passIfDue(ctx, spec, 'threshold')) {
      emitted = true;
      yield ev;
    }
    if (emitted) {
      return;
    }
  }
  yield* pressureEventIfDue(ctx, spec);
}

async function* pressureEventIfDue(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
): AsyncGenerator<CompactionPassEvent> {
  const pressure = await contextPressureOf(ctx, spec);
  if (!pressure) {
    return;
  }
  const warnRatio = spec.thresholdRatio - PRE_THRESHOLD_GAP;
  if (warnRatio <= 0) {
    return;
  }
  if (pressure.total >= pressure.available * warnRatio) {
    yield { type: 'pressure' };
  }
}

interface ContextPressure {
  total: number;
  available: number;
}

async function contextPressureOf(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
): Promise<ContextPressure | null> {
  const messages = Array.isArray(ctx.state.messages) ? (ctx.state.messages as unknown[]) : null;
  if (!messages || messages.length === 0 || ctx.state.$resume !== undefined) {
    return null;
  }
  const contextLength = await compactionWindowOf(ctx, spec);
  if (!contextLength) {
    return null;
  }
  const available = contextLength - effectiveOutputReserve(ctx, contextLength);
  if (available <= 0) {
    return null;
  }
  const toolsJson = toolsJsonOf(ctx.toolRegistry);
  const before = estimateTokens(projectedForEstimate(projectCompacted(messages)), toolsJson, {
    model: ctx.binding.model,
  });
  return { total: before.total, available };
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
