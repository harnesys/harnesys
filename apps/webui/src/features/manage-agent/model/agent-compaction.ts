import type { PortRef } from '@harnesys/studio-shared';
import { THRESHOLD_SUMMARY_NAME } from '@harnesys/studio-shared';
export interface CompactionDraft {
  thresholdPercent: string;
  maxContextTokens: string;
  reserveCapPercent: string;
  protectRecentPercent: string;
  protectTokens: string;
  protectRecentTurns: string;
  preCompactNote: boolean;
  preThresholdGapPercent: string;
  auto: boolean;
  summaryProvider: string;
  summaryModel: string;
  microcompact: boolean;
  microcompactKeepRounds: string;
  microcompactStepRounds: string;
  microcompactMinGainTokens: string;
  compactionFailureLimit: string;
  compactionRapidRefillSteps: string;
  rapidRefillMaxCompactions: string;
  overflowCompaction: boolean;
}
export function compactionDraftFrom(ref: PortRef | null): CompactionDraft {
  if (!ref) {
    return {
      thresholdPercent: '80',
      maxContextTokens: '',
      reserveCapPercent: '10',
      protectRecentPercent: '10',
      protectTokens: '',
      protectRecentTurns: '',
      preCompactNote: true,
      preThresholdGapPercent: '10',
      auto: true,
      summaryProvider: '',
      summaryModel: '',
      microcompact: false,
      microcompactKeepRounds: '5',
      microcompactStepRounds: '',
      microcompactMinGainTokens: '256',
      compactionFailureLimit: '3',
      compactionRapidRefillSteps: '3',
      rapidRefillMaxCompactions: '3',
      overflowCompaction: true,
    };
  }
  const spec = ref.spec ?? {};
  const summary = summaryModelFrom(spec.summaryModel);
  return {
    thresholdPercent: ratioToPercent(spec.thresholdRatio, 80),
    maxContextTokens: stringifyNumber(spec.maxContextTokens, ''),
    reserveCapPercent: ratioToPercent(spec.outputReserveRatio, 10),
    protectRecentPercent: ratioToPercent(spec.protectRecentRatio, 10),
    protectTokens: stringifyNumber(spec.protectTokens, ''),
    protectRecentTurns: stringifyNumber(spec.protectRecentTurns, ''),
    preCompactNote: spec.preCompactNote !== false,
    preThresholdGapPercent: ratioToPercent(spec.preThresholdGapRatio, 10),
    auto: spec.auto !== false,
    summaryProvider: summary.provider,
    summaryModel: summary.model,
    microcompact: spec.microcompact === true,
    microcompactKeepRounds: stringifyNumber(spec.microcompactKeepRounds, '5'),
    microcompactStepRounds: stringifyNumber(spec.microcompactStepRounds, ''),
    microcompactMinGainTokens: stringifyNumber(spec.microcompactMinGainTokens, '256'),
    compactionFailureLimit: stringifyNumber(spec.compactionFailureLimit, '3'),
    compactionRapidRefillSteps: stringifyNumber(spec.compactionRapidRefillSteps, '3'),
    rapidRefillMaxCompactions: stringifyNumber(spec.rapidRefillMaxCompactions, '3'),
    overflowCompaction: spec.overflowCompaction !== false,
  };
}
export function toCompactionPortRef(draft: CompactionDraft): PortRef {
  const spec: Record<string, unknown> = {
    thresholdRatio: parsePercentToRatio(draft.thresholdPercent, 0.8),
    outputReserveRatio: parsePercentToRatio(draft.reserveCapPercent, 0.1),
    protectRecentRatio: parsePercentToRatio(draft.protectRecentPercent, 0.1),
    protectRecentTurns: parseNonNegativeInt(draft.protectRecentTurns, 0),
    preCompactNote: draft.preCompactNote,
    preThresholdGapRatio: parsePercentToRatio(draft.preThresholdGapPercent, 0.1),
    auto: draft.auto,
    microcompact: draft.microcompact,
    microcompactKeepRounds: parsePositiveInt(draft.microcompactKeepRounds, 5),
    microcompactStepRounds: parseOptionalPositiveInt(draft.microcompactStepRounds),
    microcompactMinGainTokens: parseNonNegativeInt(draft.microcompactMinGainTokens, 256),
    compactionFailureLimit: parseNonNegativeInt(draft.compactionFailureLimit, 3),
    compactionRapidRefillSteps: parseNonNegativeInt(draft.compactionRapidRefillSteps, 3),
    rapidRefillMaxCompactions: parseNonNegativeInt(draft.rapidRefillMaxCompactions, 3),
    overflowCompaction: draft.overflowCompaction,
  };
  const maxContextTokens = parseOptionalPositiveInt(draft.maxContextTokens);
  if (maxContextTokens !== undefined) {
    spec.maxContextTokens = maxContextTokens;
  }
  const protectTokens = parseOptionalPositiveInt(draft.protectTokens);
  if (protectTokens !== undefined) {
    spec.protectTokens = protectTokens;
  }
  const provider = draft.summaryProvider.trim();
  const model = draft.summaryModel.trim();
  if (provider && model) {
    spec.summaryModel = { provider, model };
  }
  return { name: THRESHOLD_SUMMARY_NAME, spec };
}
function summaryModelFrom(value: unknown): {
  provider: string;
  model: string;
} {
  if (typeof value !== 'object' || value === null) {
    return { provider: '', model: '' };
  }
  const record = value as {
    provider?: unknown;
    model?: unknown;
  };
  return {
    provider: typeof record.provider === 'string' ? record.provider : '',
    model: typeof record.model === 'string' ? record.model : '',
  };
}
function stringifyNumber(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}
function ratioToPercent(value: unknown, fallbackPercent: number): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value * 100))
    : String(fallbackPercent);
}
function parsePercentToRatio(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) ? next / 100 : fallback;
}
function parseNonNegativeInt(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) && next >= 0 ? Math.floor(next) : fallback;
}
function parsePositiveInt(value: string, fallback: number): number {
  const next = parseNonNegativeInt(value, fallback);
  return Math.max(1, next);
}
function parseOptionalPositiveInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const next = Number(trimmed);
  return Number.isFinite(next) && next >= 1 ? Math.floor(next) : undefined;
}
