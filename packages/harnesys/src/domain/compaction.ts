import type { AgentModelRef } from './agent-definition.ts';

export { THRESHOLD_SUMMARY_NAME } from '../constants.ts';
export const DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS = 262_144;
export const DEFAULT_COMPACTION_PROTECT_TOKENS = 32_768;
export const MIN_COMPACTION_CUT_TOKENS = 1_024;
export const DEFAULT_COMPACTION_PRE_THRESHOLD_GAP_RATIO = 0.1;
export const DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS = 3;
export const DEFAULT_COMPACTION_FAILURE_LIMIT = 3;
export const DEFAULT_COMPACTION_RAPID_REFILL_STEPS = 3;
export interface CompactionSpec {
  /** Absolute token budget that arms compaction; wins over thresholdRatio. */
  maxContextTokens?: number;
  /** Absolute token tail kept out of every compaction cut; wins over protectRecentRatio. */
  protectTokens?: number;
  thresholdRatio?: number;
  /** Max share of the context window reserved for the reply (0–0.9, default 0.1). Caps provider metadata. */
  outputReserveRatio?: number;
  protectRecentRatio?: number;
  /** Count of trailing user+agent turns kept out of every compaction (0 = off, default). */
  protectRecentTurns?: number;
  auto?: boolean;
  summaryModel?: AgentModelRef;
  preCompactNote?: boolean;
  /** Experimental: clear tool-result bodies behind a stepped window (default: off). */
  microcompact?: boolean;
  /** Experimental: assistant rounds whose tool results stay intact (default 5). */
  microcompactKeepRounds?: number;
  /** Experimental: uncleared assistant rounds to accumulate before a stepped pass fires (default: keepRounds). */
  microcompactStepRounds?: number;
  /** Minimum estimated token gain for a microcompact pass (default 256). */
  microcompactMinGainTokens?: number;
  /** Consecutive summary failures before compaction pauses (0 = never pause, default 3). */
  compactionFailureLimit?: number;
  /** Steps window for the rapid-refill guard (0 = never pause, default 3). */
  compactionRapidRefillSteps?: number;
  /** Gap before the threshold for the pre-threshold note, as a fraction of the threshold (0–0.9, default 0.1). */
  preThresholdGapRatio?: number;
  /** Compactions inside the rapid-refill window that open the guard (0 = never pause, default 3). */
  rapidRefillMaxCompactions?: number;
  /** Retry the step with forced compaction on context overflow (default: on). */
  overflowCompaction?: boolean;
}
export interface ParsedCompactionSpec {
  maxContextTokens?: number;
  protectTokens?: number;
  thresholdRatio?: number;
  outputReserveRatio: number;
  protectRecentRatio?: number;
  protectRecentTurns: number;
  auto: boolean;
  summaryModel?: AgentModelRef;
  preCompactNote: boolean;
  microcompact: boolean;
  microcompactKeepRounds: number;
  microcompactStepRounds: number;
  microcompactMinGainTokens: number;
  compactionFailureLimit: number;
  compactionRapidRefillSteps: number;
  preThresholdGapRatio: number;
  rapidRefillMaxCompactions: number;
  overflowCompaction: boolean;
}
export interface CompactionSizing {
  maxContextTokens: number;
  protectTokens: number;
}
export interface CompactionSizingSource {
  maxContextTokens?: number;
  protectTokens?: number;
  thresholdRatio?: number;
  protectRecentRatio?: number;
}
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}
function optionalRatio(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;
}
function optionalTokens(value: unknown): number | undefined {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return n > 0 ? n : undefined;
}
function knownWindow(window?: number): number | undefined {
  const n = typeof window === 'number' && Number.isFinite(window) ? Math.floor(window) : 0;
  return n > 0 ? n : undefined;
}
export function resolveCompactionSizing(
  spec: CompactionSizingSource,
  window?: number,
): CompactionSizing {
  const known = knownWindow(window);
  const maxContextTokens =
    spec.maxContextTokens ??
    (spec.thresholdRatio !== undefined && known !== undefined
      ? Math.max(1, Math.floor(known * spec.thresholdRatio))
      : DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS);
  const protectFallback =
    spec.protectRecentRatio !== undefined && known !== undefined
      ? Math.floor(known * spec.protectRecentRatio)
      : DEFAULT_COMPACTION_PROTECT_TOKENS;
  const cutFloor = Math.min(MIN_COMPACTION_CUT_TOKENS, Math.floor(maxContextTokens / 2));
  const protectTokens = Math.max(
    0,
    Math.min(spec.protectTokens ?? protectFallback, maxContextTokens - cutFloor),
  );
  return { maxContextTokens, protectTokens };
}
export interface CompactionBudget {
  threshold: number;
  protectTokens: number;
  exhausted: boolean;
}
export function resolveCompactionBudget(
  spec: CompactionSizingSource,
  window?: number,
  reserve = 0,
): CompactionBudget {
  const sizing = resolveCompactionSizing(spec, window);
  const known = knownWindow(window);
  if (known === undefined) {
    return {
      threshold: sizing.maxContextTokens,
      protectTokens: sizing.protectTokens,
      exhausted: false,
    };
  }
  const available = known - reserve;
  if (available <= 0) {
    return {
      threshold: sizing.maxContextTokens,
      protectTokens: sizing.protectTokens,
      exhausted: true,
    };
  }
  const threshold = Math.min(sizing.maxContextTokens, available);
  const protectTokens =
    sizing.protectTokens > threshold
      ? Math.max(0, threshold - MIN_COMPACTION_CUT_TOKENS)
      : sizing.protectTokens;
  return { threshold, protectTokens, exhausted: false };
}
function isModelRef(value: unknown): value is AgentModelRef {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (
        value as {
          provider?: unknown;
        }
      ).provider === 'string' &&
      typeof (
        value as {
          model?: unknown;
        }
      ).model === 'string',
  );
}
export function parseThresholdSpec(spec?: Record<string, unknown>): ParsedCompactionSpec {
  const raw = spec ?? {};
  const positiveInt = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
    return Math.max(1, n);
  };
  const nonNegativeInt = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
    return Math.max(0, n);
  };
  const parsed: ParsedCompactionSpec = {
    maxContextTokens: optionalTokens(raw.maxContextTokens),
    protectTokens: optionalTokens(raw.protectTokens),
    thresholdRatio: optionalRatio(raw.thresholdRatio, 0.1, 1),
    outputReserveRatio: clamp(raw.outputReserveRatio, 0, 0.9, 0.1),
    protectRecentRatio: optionalRatio(raw.protectRecentRatio, 0, 0.9),
    protectRecentTurns: nonNegativeInt(raw.protectRecentTurns, 0),
    auto: raw.auto !== false,
    summaryModel: isModelRef(raw.summaryModel) ? raw.summaryModel : undefined,
    preCompactNote: raw.preCompactNote !== false,
    microcompact: raw.microcompact === true,
    microcompactKeepRounds: positiveInt(raw.microcompactKeepRounds, 5),
    microcompactStepRounds: positiveInt(
      raw.microcompactStepRounds,
      positiveInt(raw.microcompactKeepRounds, 5),
    ),
    microcompactMinGainTokens: nonNegativeInt(raw.microcompactMinGainTokens, 256),
    compactionFailureLimit: nonNegativeInt(
      raw.compactionFailureLimit,
      DEFAULT_COMPACTION_FAILURE_LIMIT,
    ),
    compactionRapidRefillSteps: nonNegativeInt(
      raw.compactionRapidRefillSteps,
      DEFAULT_COMPACTION_RAPID_REFILL_STEPS,
    ),
    preThresholdGapRatio: clamp(
      raw.preThresholdGapRatio,
      0,
      0.9,
      DEFAULT_COMPACTION_PRE_THRESHOLD_GAP_RATIO,
    ),
    rapidRefillMaxCompactions: nonNegativeInt(
      raw.rapidRefillMaxCompactions,
      DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS,
    ),
    overflowCompaction: raw.overflowCompaction !== false,
  };
  return parsed;
}
export interface CompactionMessage {
  role: 'assistant';
  kind: 'compaction';
  id: string;
  content: string;
  coveredFrom: number;
  coveredUntil: number;
  /** Message list length before the anchor was pushed; guards cursor resolution. */
  messageCount?: number;
  reason: 'threshold' | 'manual' | 'overflow';
  coveredUntilEngSeq?: number;
  coveredKind?: 'assistant' | 'user' | 'tool';
  coveredToolCallId?: string;
  coveredUntilRunId?: string;
  coveredUntilSeq?: number;
  durable?: boolean;
  unresolvedReason?: string;
  stats: {
    tokensBefore: number;
    tokensAfter: number;
    coveredCount: number;
    usage?: unknown;
  };
  model?: {
    provider: string;
    model: string;
  };
  createdAt: string;
}
export function isCompactionMessage(value: unknown): value is CompactionMessage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (
        value as {
          kind?: unknown;
        }
      ).kind === 'compaction',
  );
}
