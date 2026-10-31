import type { AgentModelRef } from './agent-definition.ts';

export { THRESHOLD_SUMMARY_NAME } from '../constants.ts';
export interface CompactionSpec {
  thresholdRatio?: number;
  protectRecentRatio?: number;
  auto?: boolean;
  summaryModel?: AgentModelRef;
  preCompactNote?: boolean;
  /** Clear tool-result bodies older than N assistant rounds (default: off). */
  microcompact?: boolean;
  /** Assistant rounds whose tool results stay intact (default 5). */
  microcompactKeepRounds?: number;
  /** Minimum estimated token gain for a microcompact pass (default 256). */
  microcompactMinGainTokens?: number;
  /** Consecutive summary failures before compaction pauses (0 = never pause, default 3). */
  compactionFailureLimit?: number;
  /** Steps window for the rapid-refill guard (0 = never pause, default 3). */
  compactionRapidRefillSteps?: number;
  /** Retry the step with forced compaction on context overflow (default: on). */
  overflowCompaction?: boolean;
}
export interface ParsedCompactionSpec {
  thresholdRatio: number;
  protectRecentRatio: number;
  auto: boolean;
  summaryModel?: AgentModelRef;
  preCompactNote: boolean;
  microcompact: boolean;
  microcompactKeepRounds: number;
  microcompactMinGainTokens: number;
  compactionFailureLimit: number;
  compactionRapidRefillSteps: number;
  overflowCompaction: boolean;
}
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
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
  return {
    thresholdRatio: clamp(raw.thresholdRatio, 0.1, 1, 0.8),
    protectRecentRatio: clamp(raw.protectRecentRatio, 0, 0.9, 0.1),
    auto: raw.auto !== false,
    summaryModel: isModelRef(raw.summaryModel) ? raw.summaryModel : undefined,
    preCompactNote: raw.preCompactNote !== false,
    microcompact: raw.microcompact === true,
    microcompactKeepRounds: positiveInt(raw.microcompactKeepRounds, 5),
    microcompactMinGainTokens: nonNegativeInt(raw.microcompactMinGainTokens, 256),
    compactionFailureLimit: nonNegativeInt(raw.compactionFailureLimit, 3),
    compactionRapidRefillSteps: nonNegativeInt(raw.compactionRapidRefillSteps, 3),
    overflowCompaction: raw.overflowCompaction !== false,
  };
}
export interface CompactionMessage {
  role: 'assistant';
  kind: 'compaction';
  id: string;
  content: string;
  coveredFrom: number;
  coveredUntil: number;
  reason: 'threshold' | 'manual' | 'overflow';
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
